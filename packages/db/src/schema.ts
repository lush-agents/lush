import type {
  ColumnType,
  Generated,
  Insertable,
  Selectable,
  Updateable
} from "kysely";

export type Timestamp = ColumnType<Date, Date | string | undefined, Date | string>;

export type UserRole = "admin" | "user";
export type OrganizationInviteStatus = "pending" | "accepted" | "declined";
export type AuthProviderKind = "password" | "oidc" | "oauth" | "saml";
export type WorkspaceMode = "chat" | "code" | "work" | "agents";
export type InferenceProviderKind =
  | "baseten"
  | "fireworks"
  | "anthropic"
  | "openai"
  | "openai-compatible";

export type UsersTable = {
  id: Generated<string>;
  email: string;
  emailVerified: boolean;
  displayName: string;
  avatarUrl: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

export type OrganizationsTable = {
  id: Generated<string>;
  name: string;
  slug: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

export type OrganizationMembershipsTable = {
  id: Generated<string>;
  organizationId: string;
  userId: string;
  role: UserRole;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

export type OrganizationInvitesTable = {
  id: Generated<string>;
  organizationId: string;
  email: string;
  role: UserRole;
  status: OrganizationInviteStatus;
  invitedByUserId: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  expiresAt: Timestamp;
  respondedAt: Timestamp | null;
};

export type AuthProvidersTable = {
  id: Generated<string>;
  organizationId: string | null;
  kind: AuthProviderKind;
  label: string;
  enabled: boolean;
  config: unknown;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

export type AuthIdentitiesTable = {
  id: Generated<string>;
  userId: string;
  providerId: string | null;
  providerKind: AuthProviderKind;
  subject: string;
  email: string | null;
  claims: unknown;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

export type PasswordCredentialsTable = {
  userId: string;
  passwordHash: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

export type SessionsTable = {
  id: Generated<string>;
  userId: string;
  organizationId: string | null;
  membershipId: string | null;
  tokenHash: string;
  userAgent: string | null;
  ipHash: string | null;
  createdAt: Timestamp;
  lastUsedAt: Timestamp;
  expiresAt: Timestamp;
  revokedAt: Timestamp | null;
};

export type AuditEventsTable = {
  id: Generated<string>;
  organizationId: string | null;
  userId: string | null;
  sessionId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: unknown;
  createdAt: Timestamp;
};

export type InferenceProvidersTable = {
  id: Generated<string>;
  organizationId: string;
  kind: InferenceProviderKind;
  label: string;
  baseUrl: string;
  encryptedApiKey: string;
  enabled: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

export type InferenceProviderModelsTable = {
  id: Generated<string>;
  providerId: string;
  modelId: string;
  label: string;
  enabled: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

export type InferenceModelDefaultsTable = {
  organizationId: string;
  mode: WorkspaceMode;
  modelSelection: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

export type LushMigrationsTable = {
  id: string;
  appliedAt: Timestamp;
};

export type Database = {
  lushMigrations: LushMigrationsTable;
  users: UsersTable;
  organizations: OrganizationsTable;
  organizationMemberships: OrganizationMembershipsTable;
  organizationInvites: OrganizationInvitesTable;
  authProviders: AuthProvidersTable;
  authIdentities: AuthIdentitiesTable;
  passwordCredentials: PasswordCredentialsTable;
  sessions: SessionsTable;
  auditEvents: AuditEventsTable;
  inferenceProviders: InferenceProvidersTable;
  inferenceProviderModels: InferenceProviderModelsTable;
  inferenceModelDefaults: InferenceModelDefaultsTable;
};

export type User = Selectable<UsersTable>;
export type NewUser = Insertable<UsersTable>;
export type UserUpdate = Updateable<UsersTable>;
export type Organization = Selectable<OrganizationsTable>;
export type OrganizationMembership = Selectable<OrganizationMembershipsTable>;
export type Session = Selectable<SessionsTable>;
export type InferenceProviderRow = Selectable<InferenceProvidersTable>;
export type InferenceProviderModelRow = Selectable<InferenceProviderModelsTable>;
