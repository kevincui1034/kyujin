import { z } from 'zod';
import { APPLICATION_STATUSES } from '@kyujin/shared';

// Tool definitions exchanged between the agent endpoint (server) and the
// chat panel (client). The model emits one of these as a structured action;
// the UI renders a preview, and on confirm posts to the matching mutation
// endpoint. Defined once here so server validation and client rendering
// stay in lockstep.

export const statusEnum = z.enum(APPLICATION_STATUSES);

const editableFieldEnum = z.enum(['company', 'role', 'status', 'notes']);
export type EditableField = z.infer<typeof editableFieldEnum>;

const bulkFieldEnum = z.enum(['status', 'notes']);
export type BulkField = z.infer<typeof bulkFieldEnum>;

// One-application field change. The model picks the id from the embedded
// applications summary in the system prompt.
export const updateApplicationArgs = z
  .object({
    applicationId: z.string().uuid(),
    field: editableFieldEnum,
    value: z.string().nullable(),
  })
  .refine(
    (v) => v.field !== 'company' || (typeof v.value === 'string' && v.value.trim().length > 0),
    { message: 'company cannot be empty' },
  )
  .refine(
    (v) => v.field !== 'status' || (typeof v.value === 'string' && statusEnum.safeParse(v.value).success),
    { message: 'status must be a valid ApplicationStatus' },
  );
export type UpdateApplicationArgs = z.infer<typeof updateApplicationArgs>;

// Filter shape used by bulk_update and query_applications. Server resolves
// this to a concrete list of ids before any mutation; the chat preview
// renders the resolved count + rows.
export const applicationFilter = z.object({
  company: z.string().min(1).optional(),
  status: statusEnum.optional(),
  ghostedPastDays: z.number().int().positive().max(3650).optional(),
});
export type ApplicationFilter = z.infer<typeof applicationFilter>;

export const bulkUpdateArgs = z
  .object({
    filter: applicationFilter,
    field: bulkFieldEnum,
    value: z.string().nullable(),
  })
  .refine(
    (v) => v.field !== 'status' || (typeof v.value === 'string' && statusEnum.safeParse(v.value).success),
    { message: 'status must be a valid ApplicationStatus' },
  );
export type BulkUpdateArgs = z.infer<typeof bulkUpdateArgs>;

export const queryApplicationsArgs = z.object({
  filter: applicationFilter,
  limit: z.number().int().positive().max(50).optional(),
});
export type QueryApplicationsArgs = z.infer<typeof queryApplicationsArgs>;

// Emitted when the model can't resolve a reference (multiple candidates,
// ambiguous "this", or missing context). The server attaches candidate
// rows in the response so the client can render a picker.
export const clarifyArgs = z.object({
  question: z.string().min(1).max(500),
  candidateIds: z.array(z.string().uuid()).max(20).optional(),
});
export type ClarifyArgs = z.infer<typeof clarifyArgs>;

export type AgentAction =
  | { type: 'update_application'; args: UpdateApplicationArgs }
  | { type: 'bulk_update'; args: BulkUpdateArgs }
  | { type: 'query_applications'; args: QueryApplicationsArgs }
  | { type: 'clarify'; args: ClarifyArgs };

// Discriminated union the AI SDK returns; same shape the client renders.
export const agentAction = z.discriminatedUnion('type', [
  z.object({ type: z.literal('update_application'), args: updateApplicationArgs }),
  z.object({ type: z.literal('bulk_update'), args: bulkUpdateArgs }),
  z.object({ type: z.literal('query_applications'), args: queryApplicationsArgs }),
  z.object({ type: z.literal('clarify'), args: clarifyArgs }),
]);

// Application row shape attached to chat responses. Subset of the DB row —
// just what the preview UI needs to render.
export interface AgentAppRow {
  id: string;
  company: string;
  role: string | null;
  status: (typeof APPLICATION_STATUSES)[number];
  lastEventAt: string;
}
