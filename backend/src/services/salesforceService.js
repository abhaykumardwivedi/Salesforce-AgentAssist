import { badGateway, badRequest } from '../utils/httpError.js';
import { logApiCall } from './logService.js';
import { getIntegrationConfig, mergeIntegration, setIntegrationStatus } from './integrationService.js';

const DEFAULT_API_VERSION = 'v60.0';
const DEFAULT_LOGIN_URL = 'https://login.salesforce.com';
const OAUTH_SCOPE = 'api refresh_token';

function platformApp() {
  return {
    clientId: process.env.SALESFORCE_CLIENT_ID || '',
    clientSecret: process.env.SALESFORCE_CLIENT_SECRET || '',
    redirectUri: process.env.SALESFORCE_REDIRECT_URI || '',
    loginUrl: (process.env.SALESFORCE_LOGIN_URL || DEFAULT_LOGIN_URL).replace(/\/$/, ''),
    apiVersion: process.env.SALESFORCE_API_VERSION || DEFAULT_API_VERSION,
  };
}

function appConfigured() {
  const app = platformApp();
  return Boolean(app.clientId && app.clientSecret && app.redirectUri);
}

export async function getSalesforceStatus(tenantId) {
  const config = (await getIntegrationConfig(tenantId, 'SALESFORCE')) || {};
  const connected = Boolean(config.refreshToken || config.accessToken);
  return {
    enabled: true,
    mode: connected ? 'REAL' : 'LOCAL',
    connected,
    appConfigured: appConfigured(),
    instanceUrl: config.instanceUrl || null,
    apiVersion: config.apiVersion || platformApp().apiVersion,
  };
}

export function buildAuthorizeUrl(state) {
  const app = platformApp();
  if (!appConfigured()) throw badRequest('Salesforce connected app is not configured on the server.');
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: app.clientId,
    redirect_uri: app.redirectUri,
    scope: OAUTH_SCOPE,
    state,
  });
  return `${app.loginUrl}/services/oauth2/authorize?${params.toString()}`;
}

export async function completeOAuth(tenantId, code) {
  const app = platformApp();
  if (!appConfigured()) throw badRequest('Salesforce connected app is not configured on the server.');
  if (!code) throw badRequest('Authorization code is required.');

  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: app.clientId,
    client_secret: app.clientSecret,
    redirect_uri: app.redirectUri,
  });

  const response = await fetch(`${app.loginUrl}/services/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  });
  const data = await response.json();
  if (!response.ok) {
    await setIntegrationStatus(tenantId, 'SALESFORCE', 'ERROR');
    throw badGateway(`Salesforce authorization failed: ${data.error_description || data.error || 'unknown error'}`);
  }

  await mergeIntegration(tenantId, 'SALESFORCE', {
    instanceUrl: data.instance_url,
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    apiVersion: app.apiVersion,
  }, 'CONNECTED');

  return { connected: true, instanceUrl: data.instance_url };
}

export async function disconnect(tenantId) {
  await setIntegrationStatus(tenantId, 'SALESFORCE', 'DISCONNECTED');
}

export async function syncContact(tenantId, customer) {
  const started = Date.now();
  const config = (await getIntegrationConfig(tenantId, 'SALESFORCE')) || {};
  if (!isConnected(config)) {
    const id = `003-local-${Date.now()}`;
    await logApiCall({ tenantId, provider: 'Salesforce-Local', endpoint: '/sobjects/Contact', method: 'POST', statusCode: 201, responseTimeMs: Date.now() - started, success: true });
    return id;
  }
  return sobjectCreate(tenantId, config, 'Contact', contactPayload(customer), started);
}

export async function createCase(tenantId, ticket, customer) {
  const started = Date.now();
  const config = (await getIntegrationConfig(tenantId, 'SALESFORCE')) || {};
  if (!isConnected(config)) {
    const id = `500-local-${Date.now()}`;
    await logApiCall({ tenantId, provider: 'Salesforce-Local', endpoint: '/sobjects/Case', method: 'POST', statusCode: 201, responseTimeMs: Date.now() - started, success: true });
    return id;
  }
  return sobjectCreate(tenantId, config, 'Case', casePayload(ticket, customer), started);
}

async function sobjectCreate(tenantId, config, sobject, payload, started) {
  const endpoint = `/sobjects/${sobject}`;
  try {
    const response = await authorizedRequest(tenantId, config, `/services/data/${config.apiVersion || DEFAULT_API_VERSION}/sobjects/${sobject}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(JSON.stringify(data));
    await logApiCall({ tenantId, provider: 'Salesforce-Real', endpoint, method: 'POST', statusCode: response.status, responseTimeMs: Date.now() - started, success: true });
    return data.id;
  } catch (error) {
    await logApiCall({ tenantId, provider: 'Salesforce-Real', endpoint, method: 'POST', statusCode: 502, responseTimeMs: Date.now() - started, success: false, errorMessage: error.message });
    throw badGateway(`Salesforce ${sobject} request failed.`);
  }
}

async function authorizedRequest(tenantId, config, urlPath, options, retried = false) {
  const url = `${config.instanceUrl}${urlPath}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  if (response.status === 401 && !retried && config.refreshToken) {
    const refreshed = await refreshAccessToken(tenantId, config);
    return authorizedRequest(tenantId, refreshed, urlPath, options, true);
  }
  return response;
}

async function refreshAccessToken(tenantId, config) {
  const app = platformApp();
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: config.refreshToken,
    client_id: app.clientId,
    client_secret: app.clientSecret,
  });
  const response = await fetch(`${app.loginUrl}/services/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  });
  const data = await response.json();
  if (!response.ok) {
    await setIntegrationStatus(tenantId, 'SALESFORCE', 'ERROR');
    throw new Error(`Salesforce token refresh failed: ${data.error_description || data.error || 'unknown error'}`);
  }
  return mergeIntegration(tenantId, 'SALESFORCE', {
    accessToken: data.access_token,
    ...(data.instance_url ? { instanceUrl: data.instance_url } : {}),
  }, 'CONNECTED');
}

function isConnected(config) {
  return Boolean(config.accessToken && config.instanceUrl);
}

function contactPayload(customer) {
  const parts = customer.fullName.trim().split(/\s+/);
  const lastName = parts.pop() || customer.fullName;
  const firstName = parts.length ? parts.join(' ') : undefined;
  return {
    ...(firstName ? { FirstName: firstName } : {}),
    LastName: lastName,
    Email: customer.email,
    Phone: customer.phone,
    Description: customer.companyName ? `Company: ${customer.companyName}` : undefined,
  };
}

function casePayload(ticket, customer) {
  return {
    Subject: ticket.subject,
    Description: ticket.description,
    Priority: ticket.priority === 'CRITICAL' ? 'High' : toSalesforceLabel(ticket.priority),
    Type: toSalesforceLabel(ticket.category),
    ...(customer.salesforceContactId ? { ContactId: customer.salesforceContactId } : {}),
  };
}

function toSalesforceLabel(value) {
  return value.toLowerCase().replace(/_/g, ' ').replace(/^\w/, (char) => char.toUpperCase());
}
