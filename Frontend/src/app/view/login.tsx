import React, { useState } from "react";
import { useNavigate } from "react-router";
import { ArrowRight, Eye, EyeOff, Lock, MapPin } from "lucide-react";
import { loginUser, touchSession } from "../api/authApi";
import logo from "../../assets/logo.png";
import desert from "../../assets/namib-desert.jpg";

const Login: React.FC = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");
    setLoading(true);
    try {
      const response = await loginUser({
        email: email.trim(),
        password,
      });

      localStorage.setItem("accessToken", response.accessToken);
      localStorage.setItem("refreshToken", response.refreshToken);
      localStorage.setItem(
        "currentUser",
        JSON.stringify({
          ...response.user,
          actualRole: response.user.role,
          viewAsRole: null,
        }),
      );
      touchSession();

      if (response.user.mustChangePassword) {
        navigate("/change-password", { replace: true });
        return;
      }

      navigate(response.user.role === "customer" ? "/customerAccount" : "/dashboard", { replace: true });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to sign in";
      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-split">
      <section className="login-hero" aria-hidden="false">
        <img src={desert} alt="" className="login-hero-photo" />
        <div className="login-hero-shade" />

        <div className="login-hero-top">
          <p className="login-hero-kicker">MTC Business Workforce Tool</p>
          <h1>Business Connect</h1>
        </div>

        <div className="login-hero-bottom">
          <span className="login-hero-accent" />
          <h2>
            Stronger connections.
            <br />
            Every step of the way.
          </h2>
          <p>
            One workspace for customer relationships, service requests and the
            follow-through that matters.
          </p>
          <div className="login-hero-rule" />
          <p className="login-hero-place">
            <MapPin size={15} strokeWidth={2} />
            MTC Olympia, Namibia
          </p>
        </div>
      </section>

      <section className="login-panel">
        <div className="login-panel-inner">
          <div className="login-brand">
            <img src={logo} alt="MTC" className="login-brand-mark" />
            <span>MTC Namibia</span>
          </div>

          <div className="login-form-slot">
            <p className="login-eyebrow">Business Connect</p>
            <h2 className="login-welcome">Welcome back.</h2>
            <p className="login-welcome-sub">Sign in to your account to continue.</p>

            <form onSubmit={handleSubmit} className="login-form">
              <div className="form-group">
                <label htmlFor="email">Email address</label>
                <input
                  type="email"
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="example@company.com"
                  autoComplete="email"
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="password">Password</label>
                <div className="password-field">
                  <input
                    type={showPassword ? "text" : "password"}
                    id="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    className="eye-toggle"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <EyeOff size={18} strokeWidth={1.75} />
                    ) : (
                      <Eye size={18} strokeWidth={1.75} />
                    )}
                  </button>
                </div>
              </div>

              <div className="login-forgot-row">
                <button
                  type="button"
                  className="forgot-link"
                  onClick={() => navigate("/forgot-password")}
                >
                  Forgot your password?
                </button>
              </div>

              {errorMessage && (
                <p className="login-error" role="alert">
                  {errorMessage}
                </p>
              )}

              <button type="submit" className="login-button" disabled={loading}>
                {loading ? "Signing in..." : "Sign In"}
                {!loading && <ArrowRight size={18} strokeWidth={2} />}
              </button>
            </form>

            <p className="login-note">
              <Lock size={14} strokeWidth={2} />
              <span>
                For authorised users only. Need access? Contact your system administrator.
              </span>
            </p>
          </div>
        </div>

        <footer className="login-legal">© 2026 MTC Namibia. All rights reserved.</footer>
      </section>

      <style>{`
        .login-split {
          min-height: 100vh;
          display: grid;
          grid-template-columns: minmax(0, 1.05fr) minmax(0, 0.95fr);
          background: #ffffff;
          color: #101828;
          font-family: Inter, "Segoe UI", system-ui, -apple-system, sans-serif;
        }

        .login-hero {
          position: relative;
          min-height: 100vh;
          overflow: hidden;
          color: #ffffff;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: 48px 52px 40px;
        }

        .login-hero-photo {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: center 42%;
        }

        .login-hero-shade {
          position: absolute;
          inset: 0;
          background:
            linear-gradient(180deg, rgba(8, 16, 28, 0.55) 0%, rgba(8, 16, 28, 0.08) 28%, rgba(8, 16, 28, 0.05) 52%, rgba(6, 12, 22, 0.72) 100%),
            linear-gradient(90deg, rgba(6, 12, 22, 0.18) 0%, rgba(6, 12, 22, 0) 40%);
        }

        .login-hero-top,
        .login-hero-bottom {
          position: relative;
          z-index: 1;
          max-width: 560px;
        }

        .login-hero-kicker {
          margin: 0 0 10px;
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: rgba(255, 255, 255, 0.88);
        }

        .login-hero-top h1 {
          margin: 0;
          font-size: 32px;
          font-weight: 600;
          line-height: 1.15;
          letter-spacing: -0.02em;
          color: #ffffff;
        }

        .login-hero-accent {
          display: block;
          width: 36px;
          height: 3px;
          border-radius: 99px;
          background: #3db4ff;
          margin-bottom: 22px;
        }

        .login-hero-bottom h2 {
          margin: 0 0 18px;
          font-size: clamp(34px, 3.4vw, 52px);
          font-weight: 600;
          line-height: 1.08;
          letter-spacing: -0.03em;
          color: #ffffff;
        }

        .login-hero-bottom p {
          margin: 0;
          max-width: 440px;
          font-size: 16px;
          line-height: 1.55;
          color: rgba(255, 255, 255, 0.88);
        }

        .login-hero-rule {
          height: 1px;
          width: min(100%, 460px);
          margin: 28px 0 18px;
          background: rgba(255, 255, 255, 0.45);
        }

        .login-hero-place {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
          color: rgba(255, 255, 255, 0.9);
        }

        .login-panel {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          background: #ffffff;
        }

        .login-panel-inner {
          flex: 1;
          width: 100%;
          max-width: 456px;
          margin: 0 auto;
          padding: 40px 28px 0;
          display: flex;
          flex-direction: column;
        }

        .login-brand {
          display: flex;
          align-items: center;
          gap: 12px;
          color: #122033;
          font-size: 22px;
          font-weight: 600;
          letter-spacing: -0.02em;
        }

        .login-brand-mark {
          width: 44px;
          height: 44px;
          object-fit: cover;
          border-radius: 8px;
          flex-shrink: 0;
        }

        .login-form-slot {
          flex: 1;
          display: flex;
          flex-direction: column;
          justify-content: center;
          padding: 28px 0 64px;
        }

        .login-eyebrow {
          margin: 0 0 12px;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: #0084c8;
        }

        .login-welcome {
          margin: 0 0 8px;
          font-size: 36px;
          font-weight: 700;
          line-height: 1.15;
          letter-spacing: -0.03em;
          color: #101828;
        }

        .login-welcome-sub {
          margin: 0 0 28px;
          font-size: 15.5px;
          line-height: 1.5;
          color: #667085;
        }

        .login-form {
          display: flex;
          flex-direction: column;
          gap: 18px;
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .form-group label {
          font-size: 14px;
          font-weight: 600;
          color: #1d2939;
        }

        .form-group input,
        .password-field input {
          width: 100%;
          height: 48px;
          padding: 0 14px;
          border: 1px solid #d7dee8;
          border-radius: 8px;
          background: #ffffff;
          color: #101828;
          font-size: 15px;
          font-family: inherit;
          outline: none;
          transition: border-color 0.15s, box-shadow 0.15s;
        }

        .form-group input::placeholder,
        .password-field input::placeholder {
          color: #98a2b3;
        }

        .form-group input:focus,
        .password-field input:focus {
          border-color: #0084c8;
          box-shadow: 0 0 0 3px rgba(0, 132, 200, 0.14);
        }

        .password-field {
          position: relative;
        }

        .password-field input {
          padding-right: 46px;
        }

        .eye-toggle {
          position: absolute;
          top: 0;
          right: 4px;
          height: 48px;
          width: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: none;
          background: transparent;
          color: #98a2b3;
          cursor: pointer;
          border-radius: 8px;
        }

        .eye-toggle:hover {
          color: #667085;
        }

        .login-forgot-row {
          display: flex;
          justify-content: flex-end;
          margin-top: -4px;
        }

        .forgot-link {
          border: none;
          background: transparent;
          padding: 0;
          color: #0084c8;
          font-size: 14px;
          font-weight: 600;
          font-family: inherit;
          cursor: pointer;
        }

        .forgot-link:hover {
          text-decoration: underline;
        }

        .login-error {
          margin: -4px 0 0;
          color: #c62828;
          font-size: 14px;
          font-weight: 500;
        }

        .login-button {
          height: 48px;
          border: none;
          border-radius: 8px;
          background: #0084c8;
          color: #ffffff;
          font-size: 15.5px;
          font-weight: 600;
          font-family: inherit;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          transition: background 0.15s;
        }

        .login-button:hover:not(:disabled) {
          background: #0073b0;
        }

        .login-button:disabled {
          background: #7eb8dc;
          cursor: not-allowed;
        }

        .login-note {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          margin: 18px 0 0;
          color: #667085;
          font-size: 13.5px;
          line-height: 1.45;
        }

        .login-note svg {
          flex-shrink: 0;
          margin-top: 2px;
        }

        .login-legal {
          border-top: 1px solid #e6ebf2;
          padding: 18px 24px 20px;
          text-align: center;
          color: #98a2b3;
          font-size: 13px;
        }

        @media (max-width: 980px) {
          .login-split {
            grid-template-columns: 1fr;
          }

          .login-hero {
            display: none;
          }

          .login-panel,
          .login-split {
            min-height: 100vh;
          }

          .login-welcome {
            font-size: 32px;
          }
        }

        @media (max-width: 520px) {
          .login-panel-inner {
            padding: 28px 20px 0;
          }

          .login-form-slot {
            padding-bottom: 32px;
          }
        }
      `}</style>
    </div>
  );
};

export default Login;
