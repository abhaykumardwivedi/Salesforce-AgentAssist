import assert from 'node:assert/strict';
import test from 'node:test';
import { executeAction } from '../src/services/copilotService.js';
import { createTicket, getTicket } from '../src/services/ticketService.js';
import { createUser } from '../src/services/userService.js';
import { listMessages } from '../src/services/conversationService.js';

const TENANT = 1;
const agent = await createUser(TENANT, {
  fullName: 'Action Agent',
  email: 'action.agent@demo.test',
  password: 'password123',
  role: 'AGENT',
});

test('approved SEND_REPLY posts a message and SET_STATUS updates status', async () => {
  const ticket = await createTicket(TENANT, { customerId: 4, subject: 'Action test', description: 'Please help with my account.' });

  const reply = await executeAction(TENANT, agent.id, { type: 'SEND_REPLY', ticketId: ticket.id, body: 'Looking into this now.' });
  assert.match(reply.summary, /Reply sent/);
  assert.equal((await listMessages(TENANT, ticket.id)).length, 1);

  await executeAction(TENANT, agent.id, { type: 'SET_STATUS', ticketId: ticket.id, status: 'RESOLVED' });
  assert.equal((await getTicket(TENANT, ticket.id)).status, 'RESOLVED');
});

test('ADD_NOTE creates an internal note', async () => {
  const ticket = await createTicket(TENANT, { customerId: 4, subject: 'Note test', description: 'Another request.' });
  await executeAction(TENANT, agent.id, { type: 'ADD_NOTE', ticketId: ticket.id, body: 'Verified the account internally.' });
  const messages = await listMessages(TENANT, ticket.id);
  assert.equal(messages[0].isInternal, true);
});

test('unknown action type and invalid ticket id are rejected', async () => {
  await assert.rejects(() => executeAction(TENANT, agent.id, { type: 'WIPE', ticketId: 1 }), /Unknown action type/);
  await assert.rejects(() => executeAction(TENANT, agent.id, { type: 'SET_STATUS', ticketId: 0, status: 'OPEN' }), /valid ticketId/);
});
