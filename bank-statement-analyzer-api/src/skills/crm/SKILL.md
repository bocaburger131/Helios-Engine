# CRM Integration Skills (Zoho Deluge + API)

Reusable templates for Zoho CRM automation that trigger the Helios Node.js backend.

## When to use

| Skill | Trigger | Helios endpoint |
|-------|---------|-----------------|
| `deluge-deal-created-webhook.deluge` | Deal **Create** workflow | `POST /api/crm/webhooks/zoho/deal-created` |
| `deluge-workdrive-folder-webhook.deluge` | After WorkDrive folder created | `POST /api/crm/webhooks/zoho/workdrive-folder` |
| `deluge-attach-workdrive-link.deluge` | Custom button / workflow | Attaches live WorkDrive link to Deal |

## Required OAuth scopes

- **CRM:** `ZohoCRM.modules.ALL`, `ZohoCRM.settings.ALL`
- **WorkDrive:** `WorkDrive.files.ALL`, `WorkDrive.files.CREATE`, `WorkDrive.teamfolders.CREATE`
- **Notes/Tasks:** included in CRM modules scope

## Environment (Helios backend)

```env
ENABLE_CRM_INTEGRATION=false   # flip to true when wiring webhooks
HELIOS_WEBHOOK_URL=https://your-api.example.com
HELIOS_WEBHOOK_SECRET=your-shared-secret
ACTIVE_CRM=zoho
```

## Deployment

1. Zoho CRM → Setup → Developer Space → Functions → Create function.
2. Paste Deluge from the `.deluge` files; replace `HELIOS_WEBHOOK_URL` and `HELIOS_WEBHOOK_SECRET`.
3. Create Workflow Rule on Deals (Create) → Instant Action → call function.
4. Verify webhook receives `{ dealId, correlationId: dealId }`.

## References

See `zoho-api-reference.json` for official doc links.
