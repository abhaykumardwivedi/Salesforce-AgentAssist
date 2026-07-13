import assert from 'node:assert/strict';
import test from 'node:test';
import { createTicket, getTicket } from '../src/services/ticketService.js';
import { createUser } from '../src/services/userService.js';
import { addMessage, assignTicket, listAssignees, listMessages } from '../src/services/conversationService.js';

const TENANT = 1;

// The test database is seeded with tickets/customers but not users (those are
// created at runtime by bootstrap), so make an agent to author/own messages.
const agent = await createUser(TENANT, {
  fullName: 'Thread Agent',
  email: 'thread.agent@demo.test',
  password: 'password123',
  role: 'AGENT',
});

test('thread: internal note keeps status, public agent reply moves OPEN to IN_PROGRESS', async () => {
  const ticket = await createTicket(TENANT, { customerId: 4, subject: 'Thread test', description: 'Please help with my account settings.' });
  assert.equal(ticket.status, 'OPEN');

  await addMessage(TENANT, ticket.id, { authorType: 'AGENT', authorUserId: agent.id, body: 'Checking the account history first.', isInternal: true });
  assert.equal((await getTicket(TENANT, ticket.id)).status, 'OPEN');

  const reply = await addMessage(TENANT, ticket.id, { authorType: 'AGENT', authorUserId: agent.id, body: 'Hi, happy to help with this.' });
  assert.equal(reply.isInternal, false);
  assert.equal((await getTicket(TENANT, ticket.id)).status, 'IN_PROGRESS');

  const messages = await listMessages(TENANT, ticket.id);
  assert.equal(messages.length, 2);
  assert.equal(messages[0].isInternal, true);
  assert.equal(messages[1].body, 'Hi, happy to help with this.');
});

test('assignment sets and clears the ticket owner', async () => {
  const agents = await listAssignees(TENANT);
  assert.ok(agents.some((a) => a.id === agent.id));

  const ticket = await createTicket(TENANT, { customerId: 4, subject: 'Assign test', description: 'Another account request.' });
  const assigned = await assignTicket(TENANT, ticket.id, agent.id);
  assert.equal(assigned.assignedUserId, agent.id);
  assert.equal((await getTicket(TENANT, ticket.id)).assignedUserName, agent.fullName);

  const cleared = await assignTicket(TENANT, ticket.id, null);
  assert.equal(cleared.assignedUserId, null);
});
