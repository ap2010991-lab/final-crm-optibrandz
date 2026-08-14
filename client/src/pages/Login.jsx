import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { LogIn } from "lucide-react";
import { useAuth } from "../lib/api";
import { firstAllowedPath } from "../lib/nav";
import BrandLogo from "../components/BrandLogo";

export default function Login({ portal = false }) {
  // Both fields used to ship pre-filled with the real owner email and password, so the
  // credentials were visible to anyone who opened the page.
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const { login, user, token } = useAuth();
  const navigate = useNavigate();

  async function submit(event) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const signedIn = await login(email, password);
      navigate(signedIn.role === "CLIENT" ? "/portal/dashboard" : firstAllowedPath(signedIn), { replace: true });
    } catch (err) {
      // The old catch reported "Email or password did not match" for every failure,
      // including being offline or locked out.
      setError(err?.message || "Could not sign in. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (token && user) return <Navigate to={user.role === "CLIENT" ? "/portal/dashboard" : firstAllowedPath(user)} replace />;

  return <div className="login-stage">
    <form onSubmit={submit} className="login-card">
      <div className="mb-7 flex items-center gap-3">
        <BrandLogo className="size-14" />
        <div>
          <h1 className="text-xl font-black">Optibrandz CRM</h1>
          <p className="text-sm font-medium text-zinc-500">{portal ? "Client portal" : "Agency operations"}</p>
        </div>
      </div>

      <label className="block">
        <span className="field-label">Email</span>
        <input
          className="input"
          type="email"
          inputMode="email"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck="false"
          placeholder="you@optibrandz.in"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </label>

      <label className="mt-4 block">
        <span className="field-label">Password</span>
        <input
          className="input"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
      </label>

      {error && <p className="form-error mt-4">{error}</p>}

      <button className="primary mt-6 h-12 w-full" disabled={busy}>
        <LogIn size={17} /> {busy ? "Signing in..." : "Sign in"}
      </button>
    </form>
  </div>;
}
