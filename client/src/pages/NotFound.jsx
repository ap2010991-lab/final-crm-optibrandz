import { Link } from "react-router-dom";
import { useAuth } from "../lib/api";
import { firstAllowedPath } from "../lib/nav";

export default function NotFound() {
  const { user } = useAuth();
  return <div className="panel text-center">
    <h2 className="text-xl font-black">Page not found</h2>
    <p className="mt-2 text-sm font-semibold text-slate-600">That CRM screen does not exist.</p>
    <Link className="primary mt-4 inline-flex" to={firstAllowedPath(user)}>Back to the CRM</Link>
  </div>;
}
