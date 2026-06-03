import React, { useState } from "react";
import { useNavigate } from "react-router";
import { loginUser } from "../api/authApi";


import logo from '../../assets/logo.png';

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
      localStorage.setItem("currentUser", JSON.stringify(response.user));

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
    <div className="login-container">
      <div className="login-bg-blob login-bg-blob--top" />
      <div className="login-bg-blob login-bg-blob--bottom" />

      {/* Logo & Heading */}
      <div className="login-header">
        <div className="login-logo">
          <img src={logo} alt="MTC Logo" className="login-logo-img" />
        </div>
        <h1 className="login-title">MTC Namibia</h1>
        <p className="login-subtitle">Business Connect – Sign in to continue</p>
      </div>

      {/* Card */}
      <div className="login-card">
        <h2 className="login-welcome">Welcome Back</h2>
        <p className="login-welcome-sub">Enter your credentials to continue</p>

        <form onSubmit={handleSubmit} className="login-form">
          {/* Role */}
          {/* <div className="form-group">
            <label htmlFor="role">I am a</label>
            <div className="select-wrapper">
              <select
                id="role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                required
                className={!role ? "select-placeholder" : ""}
              >
                <option value="" disabled>
                  Select your role
                </option>
                {roles.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <span className="select-chevron">▾</span>
            </div>
          </div> */}

          {/* Email */}
          <div className="form-group">
            <label htmlFor="email">Email Address</label>
            <div className="input-wrapper">
              <span className="input-icon">
                <svg
                  width="17"
                  height="17"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                  <polyline points="22,6 12,13 2,6" />
                </svg>
              </span>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your.email@company.com"
                required
              />
            </div>
          </div>

          {/* Password */}
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <div className="input-wrapper">
              <span className="input-icon">
                <svg
                  width="17"
                  height="17"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0110 0v4" />
                </svg>
              </span>
              <input
                type={showPassword ? "text" : "password"}
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
              />
              <button
                type="button"
                className="eye-toggle"
                onClick={() => setShowPassword(!showPassword)}
                aria-label="Toggle password visibility"
              >
                {showPassword ? (
                  <svg
                    width="17"
                    height="17"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" />
                    <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg
                    width="17"
                    height="17"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <button type="submit" className="login-button" disabled={loading}>
            {loading ? "Signing in..." : "Sign In"}
          </button>

          {errorMessage && <p className="login-error">{errorMessage}</p>}
        </form>

        <div className="login-footer">
          <button
            type="button"
            className="forgot-link forgot-link-btn"
            onClick={() => navigate("/forgot-password")}
          >
            Forgot your password?
          </button>
        </div>

      </div>



  

      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }

        .login-container {
          min-height: 100vh;
          background: linear-gradient(135deg, #ddeeff 0%, #f0f7ff 50%, #ffffff 100%);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 40px 24px;
          font-family: 'Helvetica Neue', Arial, sans-serif;
          position: relative;
          overflow: hidden;
        }

        .login-bg-blob {
          position: fixed;
          border-radius: 50%;
          pointer-events: none;
        }
        .login-bg-blob--top {
          top: -80px; left: -80px;
          width: 320px; height: 320px;
          background: radial-gradient(circle, rgba(26,122,191,0.12) 0%, transparent 70%);
        }
        .login-bg-blob--bottom {
          bottom: -60px; right: -60px;
          width: 280px; height: 280px;
          background: radial-gradient(circle, rgba(26,122,191,0.09) 0%, transparent 70%);
        }

        /* Header */
        .login-header {
          text-align: center;
          margin-bottom: 28px;
          position: relative;
          z-index: 1;
        }
        .login-logo {
          width: 80px;
          height: 80px;
          border-radius: 18px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 16px;
          position: relative;
        }
        .login-logo-img {
          width: 100%;
          height: 100%;
          object-fit: contain;
        }
        .login-logo-text {
          color: #fff;
          font-size: 28px;
          font-weight: 700;
          font-style: italic;
          font-family: Georgia, serif;
          letter-spacing: 1px;
        }
        .login-logo-arrow {
          position: absolute;
          bottom: -7px;
          right: 10px;
          width: 0; height: 0;
          border-left: 8px solid transparent;
          border-right: 8px solid transparent;
          border-top: 10px solid #e63946;
        }
        .login-title {
          font-size: 2rem;
          font-weight: 500;
          color: #3b8fc7;
          // font-family: Georgia, serif;
          letter-spacing: -0.5px;
          margin-bottom: 6px;
        }
        .login-subtitle {
          font-size: 0.95rem;
          color: #6b7280;
        }

        /* Card */
        .login-card {
          background: rgba(255,255,255,0.93);
          backdrop-filter: blur(12px);
          border-radius: 20px;
          padding: 40px 44px;
          width: 100%;
          max-width: 480px;
          box-shadow: 0 8px 40px rgba(26,122,191,0.12), 0 1px 3px rgba(0,0,0,0.06);
          border: 1px solid rgba(255,255,255,0.8);
          position: relative;
          z-index: 1;
        }
        .login-welcome {
          font-size: 1.4rem;
          font-weight: 700;
          color: #111827;
          font-family: Georgia, serif;
          margin-bottom: 4px;
        }
        .login-welcome-sub {
          font-size: 0.9rem;
          color: #6b7280;
          margin-bottom: 28px;
        }

        /* Form */
        .login-form {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .form-group {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .form-group label {
          font-size: 0.875rem;
          font-weight: 600;
          color: #374151;
        }

        /* Select */
        .select-wrapper {
          position: relative;
        }
        .select-wrapper select {
          width: 100%;
          padding: 13px 40px 13px 16px;
          border-radius: 10px;
          border: 2px solid #e5e7eb;
          background: #f8fafc;
          color: #111827;
          font-size: 0.9rem;
          font-family: inherit;
          outline: none;
          appearance: none;
          cursor: pointer;
          transition: border-color 0.2s;
        }
        .select-wrapper select.select-placeholder {
          color: #9ca3af;
        }
        .select-wrapper select:focus {
          border-color: #3b8fc7;
        }
        .select-chevron {
          position: absolute;
          right: 14px;
          top: 50%;
          transform: translateY(-50%);
          pointer-events: none;
          color: #9ca3af;
          font-size: 14px;
        }

        /* Input */
        .input-wrapper {
          display: flex;
          align-items: center;
          background: #f8fafc;
          border: 2px solid #e5e7eb;
          border-radius: 10px;
          padding: 0 14px;
          transition: border-color 0.2s;
        }
        .input-wrapper:focus-within {
          border-color: #3b8fc7;
        }
        .input-icon {
          color: #9ca3af;
          display: flex;
          align-items: center;
          margin-right: 10px;
          flex-shrink: 0;
        }
        .input-wrapper input {
          flex: 1;
          padding: 13px 0;
          border: none;
          background: transparent;
          font-size: 0.9rem;
          font-family: inherit;
          color: #111827;
          outline: none;
        }
        .input-wrapper input::placeholder {
          color: #9ca3af;
        }
        .eye-toggle {
          background: none;
          border: none;
          cursor: pointer;
          color: #9ca3af;
          display: flex;
          align-items: center;
          padding: 0;
          margin-left: 8px;
          flex-shrink: 0;
        }
        .eye-toggle:hover {
          color: #6b7280;
        }

        /* Button */
        .login-button {
          width: 100%;
          padding: 14px;
          border-radius: 10px;
          background: linear-gradient(135deg, #3b8fc7 0%, #1565a8 100%);
          color: #ffffff;
          font-size: 1rem;
          font-weight: 600;
          font-family: inherit;
          border: none;
          cursor: pointer;
          letter-spacing: 0.3px;
          box-shadow: 0 4px 14px rgba(26,122,191,0.35);
          transition: background 0.2s, box-shadow 0.2s;
          margin-top: 8px;
        }
        .login-button:hover:not(:disabled) {
          background: linear-gradient(135deg, #1565a8 0%, #0f4f8a 100%);
          box-shadow: 0 6px 18px rgba(26,122,191,0.45);
        }
        .login-button:disabled {
          background: #5ba8d8;
          box-shadow: none;
          cursor: not-allowed;
        }

        .login-error {
          margin-top: 12px;
          color: #c62828;
          font-size: 0.875rem;
          text-align: center;
          font-weight: 500;
        }

        /* Footer */
        .login-footer {
          text-align: center;
          margin-top: 20px;
        }
        .forgot-link {
          color: #3b8fc7;
          font-size: 0.875rem;
          font-weight: 500;
          text-decoration: none;
        }
        .forgot-link-btn {
          background: transparent;
          border: none;
          cursor: pointer;
        }
        .forgot-link:hover {
          text-decoration: underline;
        }
          .disclaimer {
            margin-top: 40px;
            font-size: 0.75rem;
            color: #9ca3af;
          }

        @media (max-width: 520px) {
          .login-container {
            padding: 24px 16px;
          }
          .login-card {
            padding: 28px 20px;
          }
          .login-header {
            margin-bottom: 20px;
          }
          .login-title {
            font-size: 1.5rem;
          }
          .login-subtitle {
            font-size: 0.875rem;
          }
        }
      `}</style>

            <div className="disclaimer">
          <p>© 2026 MTC Namibia. All rights reserved.</p>
        </div>

    </div>
  );
};

export default Login;
