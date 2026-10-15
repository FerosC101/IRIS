import { Link } from "react-router-dom";
import { EmptyState } from "@/components/ui/states";

export function NotFound() {
  return (
    <div className="mx-auto max-w-lg py-10">
      <EmptyState title="Page not found" action={<Link to="/" className="text-sm font-medium text-teal-900 hover:underline">Go to the overview</Link>}>
        The address may be mistyped, or the item may have been removed when the demo data was reset.
      </EmptyState>
    </div>
  );
}
