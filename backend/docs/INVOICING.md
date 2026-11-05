# Customer invoices

Run `npx prisma migrate deploy` in `backend` before deploying the invoice API. The November 2026 migrations add `invoices`, `invoice_items`, and `customer_settings.monthly_minimum_spend`.

The admin UI is at `/global/invoices`. Choose a customer and inclusive dates, then choose automatic MRC, manual MRC, or both. Automatic MRC uses active subscription periods from `SUBSCRIPTION_SERVICE_URL`; asset-plan recurring charges cover DID/TFN rental when that rental is included in the plan. Standalone number rental prices are not configured in the current number inventory, so no separate rental fee is invented.

Posted `otc`, `cdr`, and `recording` transactions supply the other charges. A customer's monthly minimum usage spend is set in Customer → Main and prorated by calendar day. The shortfall appears as a separate invoice item. Existing duration minimums are already reflected in rated CDR transactions.

Generated invoices are snapshots with status `PENDING` and `amount_paid=0`. Generation does not debit the wallet again: transaction charges have already changed the wallet, while manually entered amounts require a separate payment or adjustment workflow. Invoice creation blocks overlapping active date ranges for the same customer. The printable view supports browser Save as PDF. CDR CSV export covers posted CDR transactions in the invoice period.

To generate last month's invoices automatically on the first day of each UTC month, set `INVOICE_AUTO_MONTHLY_ENABLED=true` on one continuously running backend instance. Leave it false on other replicas. Failed customers are retried hourly during the first UTC day; existing invoices are skipped. The subscription service must be reachable from that instance. Email delivery uses `ZEPTOMAIL_ENABLED=true`, `ZEPTOMAIL_SEND_MAIL_TOKEN`, and `ZEPTOMAIL_FROM_ADDRESS`.
