import React, { useState } from "react";
import { useNavigate } from "react-router";
import { changePassword, getCurrentUser, logoutUser } from "../api/authApi";
import { useSessionWatch } from "../auth/useSessionWatch";
import logo from "../../assets/logo.png";

const ChangePassword: React.FC = () => {
  useSessionWatch();
  const navigate = useNavigate();
  const currentUser = getCurrentUser();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");

    if (newPassword !== confirmPassword) {
      setErrorMessage("New passwords do not match");
      return;
    }
    if (newPassword === currentPassword) {
      setErrorMessage("New password must be different from your one-time password");
      return;
    }
    if (newPassword.length < 8) {
      setErrorMessage("New password must be at least 8 characters");
      return;
    }

    setLoading(true);
    try {
      await changePassword({ currentPassword, newPassword });
      navigate(currentUser?.role === "customer" ? "/customerAccount" : "/dashboard", {
        replace: true,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to change password";
      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await logoutUser();
    navigate("/", { replace: true });
  };

  return (
    <div className="login-container">
      <div className="login-bg-blob login-bg-blob--top" />
      <div className="login-bg-blob login-bg-blob--bottom" />

      <div className="login-header">
        <div className="login-logo">
          <img src={logo} alt="MTC Logo" className="login-logo-img" />
        </div>
        <h1 className="login-title">MTC Namibia</h1>
        <p className="login-subtitle">Business Connect – Set a new password</p>
      </div>

      <div className="login-card">
        <h2 className="login-welcome">Change your password</h2>
        <p className="login-welcome-sub">
          You signed in with a one-time password. Choose a new password to continue.
        </p>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="currentPassword">One-time password</label>
            <div className="input-wrapper">
              <input
                type={showCurrent ? "text" : "password"}
                id="currentPassword"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Password from your email"
                required
              />
              <button
                type="button"
                className="eye-toggle"
                onClick={() => setShowCurrent(!showCurrent)}
                aria-label="Toggle current password visibility"
              >
                {showCurrent ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="newPassword">New password</label>
            <div className="input-wrapper">
              <input
                type={showNew ? "text" : "password"}
                id="newPassword"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 8 characters"
                required
              />
              <button
                type="button"
                className="eye-toggle"
                onClick={() => setShowNew(!showNew)}
                aria-label="Toggle new password visibility"
              >
                {showNew ? "Hide" : "Show"}
              </button>
            </div>
            <p className="field-hint">
              Use at least 8 characters, including uppercase, lowercase, and a number.
            </p>
          </div>

          <div className="form-group">
            <label htmlFor="confirmPassword">Confirm new password</label>
            <div className="input-wrapper">
              <input
                type={showNew ? "text" : "password"}
                id="confirmPassword"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter your new password"
                required
              />
            </div>
          </div>

          <button type="submit" className="login-button" disabled={loading}>
            {loading ? "Saving..." : "Save new password"}
          </button>

          {errorMessage && <p className="login-error">{errorMessage}</p>}
        </form>

        <div className="login-footer">
          <button type="button" className="forgot-link forgot-link-btn" onClick={handleSignOut}>
            Sign out
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
        }
        .login-logo-img {
          width: 100%;
          height: 100%;
          object-fit: contain;
        }
        .login-title {
          font-size: 2rem;
          font-weight: 500;
          color: #3b8fc7;
          letter-spacing: -0.5px;
          margin-bottom: 6px;
        }
        .login-subtitle {
          font-size: 0.95rem;
          color: #6b7280;
        }

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
        .field-hint {
          font-size: 0.75rem;
          color: #6b7280;
        }

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
          color: #3b8fc7;
          font-size: 0.8rem;
          font-weight: 600;
          padding: 0;
          margin-left: 8px;
          flex-shrink: 0;
        }

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
          .login-container { padding: 24px 16px; }
          .login-card { padding: 28px 20px; }
          .login-title { font-size: 1.5rem; }
        }
      `}</style>

      <div className="disclaimer">
        <p>© 2026 MTC Namibia. All rights reserved.</p>
      </div>
    </div>
  );
};

export default ChangePassword;
