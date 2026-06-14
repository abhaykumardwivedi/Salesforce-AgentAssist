import { badGateway } from '../utils/httpError.js';
import { logApiCall } from './logService.js';

const salesforceConfig = () => ({
  enabled: String(process.env.SALESFORCE_ENABLED ?? 'true').toLowerCase() === 'true',
  mode: String(process.env.SALESFORCE_MODE || 'MOCK').toUpperCase(),
  apiVersion: process.env.SALESFORCE_API_VERSION || 'v60.0',
  configured: hasRealConfig(),
});

export function getSalesforceStatus() {
  const config = salesforceConfig();
  return {
    enabled: config.enabled,
    mode: config.mode === 'REAL' ? 'REAL' : 'MOCK',
    configured: config.mode === 'REAL' ? config.configured : true,
    apiVersion: config.apiVersion,
  };
}

export async function syncContact(customer) {
  const started = Date.now();
  const status = getSalesforceStatus();
  if (!status.enabled) {
    logApiCall({
      provider: 'Salesforce-Mock',
      endpoint: '/sobjects/Contact',
      method: 'POST',
      statusCode: 503,
      responseTimeMs: Date.now() - started,
      success: false,
      errorMessage: 'Salesforce integration is disabled.',
    });
    throw badGateway('Salesforce integration is disabled.');
  }

  if (status.mode === 'REAL') {
    return syncRealContact(customer, started);
  }

  const id = `003-mock-${Date.now()}`;
  logApiCall({
    provider: 'Salesforce-Mock',
    endpoint: '/sobjects/Contact',
    method: 'POST',
    statusCode: 201,
    responseTimeMs: Date.now() - started,
    success: true,
  });
  return id;
}

export async function createCase(ticket, customer) {
  const started = Date.now();
  const status = getSalesforceStatus();
  if (!status.enabled) {
    logApiCall({
      provider: 'Salesforce-Mock',
      endpoint: '/sobjects/Case',
      method: 'POST',
      statusCode: 503,
      responseTimeMs: Date.now() - started,
      success: false,
      errorMessage: 'Salesforce integration is disabled.',
    });
    throw badGateway('Salesforce integration is disabled.');
  }

  if (status.mode === 'REAL') {
    return createRealCase(ticket, customer, started);
  }

  const id = `500-mock-${Date.now()}`;
  logApiCall({
    provider: 'Salesforce-Mock',
    endpoint: '/sobjects/Case',
    method: 'POST',
    statusCode: 201,
    responseTimeMs: Date.now() - started,
    success: true,
  });
  return id;
}

async function syncRealContact(customer, started) {
  try {
    const session = await authenticate();
    const endpoint = `${session.instanceUrl}/services/data/${process.env.SALESFORCE_API_VERSION || 'v60.0'}/sobjects/Contact`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(contactPayload(customer)),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(JSON.stringify(data));
    logApiCall({ provider: 'Salesforce-Real', endpoint, method: 'POST', statusCode: response.status, responseTimeMs: Date.now() - started, success: true });
    return data.id;
  } catch (error) {
    logApiCall({ provider: 'Salesforce-Real', endpoint: '/sobjects/Contact', method: 'POST', statusCode: 502, responseTimeMs: Date.now() - started, success: false, errorMessage: error.message });
    throw badGateway('Salesforce contact sync failed.');
  }
}

async function createRealCase(ticket, customer, started) {
  try {
    const session = await authenticate();
    const endpoint = `${session.instanceUrl}/services/data/${process.env.SALESFORCE_API_VERSION || 'v60.0'}/sobjects/Case`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(casePayload(ticket, customer)),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(JSON.stringify(data));
    logApiCall({ provider: 'Salesforce-Real', endpoint, method: 'POST', statusCode: response.status, responseTimeMs: Date.now() - started, success: true });
    return data.id;
  } catch (error) {
    logApiCall({ provider: 'Salesforce-Real', endpoint: '/sobjects/Case', method: 'POST', statusCode: 502, responseTimeMs: Date.now() - started, success: false, errorMessage: error.message });
    throw badGateway('Salesforce case creation failed.');
  }
}

async function authenticate() {
  if (!hasRealConfig()) throw new Error('Salesforce real mode is not fully configured.');
  const params = new URLSearchParams({
    grant_type: 'password',
    client_id: process.env.SALESFORCE_CLIENT_ID,
    client_secret: process.env.SALESFORCE_CLIENT_SECRET,
    username: process.env.SALESFORCE_USERNAME,
    password: `${process.env.SALESFORCE_PASSWORD}${process.env.SALESFORCE_SECURITY_TOKEN}`,
  });
  const loginUrl = process.env.SALESFORCE_LOGIN_URL || 'https://login.salesforce.com';
  const response = await fetch(`${loginUrl.replace(/\/$/, '')}/services/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(data));
  return { accessToken: data.access_token, instanceUrl: data.instance_url };
}

function hasRealConfig() {
  return [
    'SALESFORCE_LOGIN_URL',
    'SALESFORCE_CLIENT_ID',
    'SALESFORCE_CLIENT_SECRET',
    'SALESFORCE_USERNAME',
    'SALESFORCE_PASSWORD',
    'SALESFORCE_SECURITY_TOKEN',
    'SALESFORCE_API_VERSION',
  ].every((key) => Boolean(process.env[key]));
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
