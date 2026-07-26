# CREATE_INVOICE_DRAFT skill

Use when the user wants to create a draft invoice for a contact.

## Exact shape

```json
{
  "action": "CREATE_INVOICE_DRAFT",
  "params": {
    "contactName": "Kaiser & Kaiser",
    "description": "Consulting services July 2026",
    "currency": "EUR",
    "lines": [
      {
        "description": "Strategy workshop",
        "quantity": 1,
        "unitPrice": 2500,
        "taxRateId": "<exact UUID from Available tax rates in the system prompt>"
      }
    ]
  },
  "confidence": 0.9,
  "reasoning": "User asked to invoice the contact for the described work."
}
```

## Rules

- Requires a resolvable contact: prefer `contactId` if known, otherwise `contactName` (server will look it up).
- `lines` is an array of line items. If omitted or empty, the server may fall back to a single line using `description` + `amount`.
- **`taxRateId` must be an exact UUID from the "Available tax rates" list in the system prompt** (live data this turn). Never invent codes like "de-mwst-19" or "19%".
- **`unitPrice` is always NET** (before tax). The server adds tax from `taxRateId`.
- **Inclusive VAT / inkl. MwSt / brutto:**
  - User amount is GROSS (final total including tax).
  - Choose the matching rate UUID (e.g. 19%).
  - Set `unitPrice = round(gross / (1 + rate), 2)` (e.g. 3000 / 1.19 → **2521.01**), `quantity` usually 1, and set `taxRateId`.
  - Always round money to **2 decimal places**. Never leave long floats like 2521.008403…
  - Do **not** put the gross amount in `unitPrice` with a tax rate (that would add tax again).
- **Exclusive / ohne MwSt / net mentioned or plain "3000€":**
  - Put 3000 in `unitPrice` and attach the standard/default tax UUID so tax is added on top.
- `currency`: defaults to company base / EUR.
- Draft invoices are created with status DRAFT.
- Do not use this for final sent invoices (use PROPOSE_SEND_INVOICE if needed later).

Call get_skill("create-invoice-draft") before emitting this action when unsure of the shape.
