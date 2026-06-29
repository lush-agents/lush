export type AuthRefreshReason =
  | "claims_changed"
  | "membership_changed"
  | "organization_changed"
  | "session_revoked";

export type ClientEvent = {
  type: "auth.refresh_required";
  reason: AuthRefreshReason;
};

export type ClientEventPrincipal = {
  userId: string;
  sessionId: string;
  organizationId: string | null;
  membershipId: string | null;
};

export type ClientEventScope = Partial<{
  userId: string;
  sessionId: string;
  organizationId: string;
  membershipId: string;
}>;

export class ClientEventBroker {
  private nextId = 1;
  private readonly subscribers = new Map<
    number,
    {
      principal: ClientEventPrincipal;
      send: (event: ClientEvent) => void;
    }
  >();

  subscribe(
    principal: ClientEventPrincipal,
    send: (event: ClientEvent) => void
  ) {
    const id = this.nextId;
    this.nextId += 1;
    this.subscribers.set(id, { principal, send });

    return () => {
      this.subscribers.delete(id);
    };
  }

  publishAuthRefresh(scope: ClientEventScope, reason: AuthRefreshReason) {
    const event: ClientEvent = {
      type: "auth.refresh_required",
      reason
    };

    for (const subscriber of this.subscribers.values()) {
      if (clientEventScopeMatches(subscriber.principal, scope)) {
        subscriber.send(event);
      }
    }
  }
}

export function clientEventScopeMatches(
  principal: ClientEventPrincipal,
  scope: ClientEventScope
) {
  return (
    (scope.sessionId !== undefined && scope.sessionId === principal.sessionId) ||
    (scope.membershipId !== undefined &&
      scope.membershipId === principal.membershipId) ||
    (scope.organizationId !== undefined &&
      scope.organizationId === principal.organizationId) ||
    (scope.userId !== undefined && scope.userId === principal.userId)
  );
}
