import { expect, test } from "bun:test";
import {
  ClientEventBroker,
  clientEventScopeMatches,
  type ClientEventPrincipal
} from "../services/api/src/client-events";

const principal: ClientEventPrincipal = {
  userId: "user-1",
  sessionId: "session-1",
  organizationId: "org-1",
  membershipId: "membership-1"
};

test("client event scopes match by session, membership, organization, or user", () => {
  expect(clientEventScopeMatches(principal, { sessionId: "session-1" })).toBe(
    true
  );
  expect(
    clientEventScopeMatches(principal, { membershipId: "membership-1" })
  ).toBe(true);
  expect(
    clientEventScopeMatches(principal, { organizationId: "org-1" })
  ).toBe(true);
  expect(clientEventScopeMatches(principal, { userId: "user-1" })).toBe(true);
  expect(clientEventScopeMatches(principal, { sessionId: "other" })).toBe(false);
});

test("client event broker publishes auth refresh events to matching subscribers", () => {
  const broker = new ClientEventBroker();
  const firstEvents: unknown[] = [];
  const secondEvents: unknown[] = [];

  broker.subscribe(principal, (event) => firstEvents.push(event));
  broker.subscribe(
    {
      ...principal,
      sessionId: "session-2",
      membershipId: "membership-2"
    },
    (event) => secondEvents.push(event)
  );

  broker.publishAuthRefresh(
    { membershipId: "membership-1" },
    "membership_changed"
  );

  expect(firstEvents).toEqual([
    {
      type: "auth.refresh_required",
      reason: "membership_changed"
    }
  ]);
  expect(secondEvents).toEqual([]);
});

test("client event broker unsubscribe stops delivery", () => {
  const broker = new ClientEventBroker();
  const events: unknown[] = [];
  const unsubscribe = broker.subscribe(principal, (event) => events.push(event));

  unsubscribe();
  broker.publishAuthRefresh({ userId: "user-1" }, "claims_changed");

  expect(events).toEqual([]);
});
