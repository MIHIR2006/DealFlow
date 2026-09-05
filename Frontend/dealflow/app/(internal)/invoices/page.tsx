import { ModuleStub } from "@/components/workspace/module-stub";

export default function InvoicesPage() {
  return (
    <ModuleStub
      title="Invoices"
      kicker="Cash"
      body="Record a payment and the invoice moves PARTIAL or PAID. No gateway — manual entry, as scoped."
    />
  );
}
