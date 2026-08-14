import { Component } from "react";

// Without this, one bad record or a render-time exception turned the whole CRM into a
// blank white screen with nothing to tap — especially unhelpful on a phone.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("CRM render error", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return <div className="grid min-h-screen place-items-center bg-[#fff9ed] p-6">
      <div className="panel w-full max-w-md text-center">
        <h1 className="text-lg font-black">Something broke on this screen</h1>
        <p className="mt-2 text-sm font-semibold leading-6 text-zinc-600">
          The rest of the CRM is fine. Reload to carry on, and if it keeps happening on the
          same page tell your developer what you tapped just before.
        </p>
        <pre className="mt-3 max-h-32 overflow-auto rounded-xl bg-zinc-100 p-3 text-left text-[11px] text-zinc-600">
          {String(this.state.error?.message || this.state.error)}
        </pre>
        <button className="primary mt-4 w-full" onClick={() => window.location.reload()}>Reload CRM</button>
      </div>
    </div>;
  }
}
