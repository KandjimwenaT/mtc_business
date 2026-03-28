import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import {
  forgotPassword,
  resetForgottenPassword,
  verifyResetOTP,
} from "../api/authApi";
import logo from "../../assets/logo.png";

type Step = "email" | "otp" | "password";

const parseExpiresInToSeconds = (expiresIn?: string): number => {
  if (!expiresIn) return 180;
  const match = /^(\d+)\s*m$/i.exec(expiresIn.trim());
  if (!match) return 180;
  return Number(match[1]) * 60;
};

const formatCountdown = (seconds: number): string => {
  const safeSeconds = Math.max(0, seconds);
  const mins = Math.floor(safeSeconds / 60);
  const secs = safeSeconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
};

const ForgotPassword: React.FC = () => {
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [otpDigits, setOtpDigits] = useState<string[]>(["", "", "", ""]);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [otpExpiresAt, setOtpExpiresAt] = useState<number | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState(0);

  const stepTitle = useMemo(() => {
    if (step === "email") return "Forgot Password";
    if (step === "otp") return "Verify OTP";
    return "Create New Password";
  }, [step]);

  const otpExpired = step === "otp" && otpExpiresAt !== null && secondsRemaining <= 0;

  useEffect(() => {
    if (step !== "otp" || !otpExpiresAt) return;

    const update = () => {
      const remaining = Math.ceil((otpExpiresAt - Date.now()) / 1000);
      setSecondsRemaining(Math.max(0, remaining));
    };

    update();
    const interval = window.setInterval(update, 1000);
    return () => window.clearInterval(interval);
  }, [step, otpExpiresAt]);

  const sendOtp = async () => {
    setErrorMessage("");
    setMessage("");
    setLoading(true);

    try {
      const response = await forgotPassword({ email: email.trim() });
      setMessage(response.message || "OTP sent to your email.");
      const ttl = parseExpiresInToSeconds(response.expiresIn);
      setOtpExpiresAt(Date.now() + ttl * 1000);
      setSecondsRemaining(ttl);
      setOtpDigits(["", "", "", ""]);
      setStep("otp");
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "Failed to send OTP code";
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    await sendOtp();
  };

  const handleResendOtp = async () => {
    await sendOtp();
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");
    setMessage("");

    if (otpExpired) {
      setErrorMessage("OTP expired. Please request a new OTP.");
      return;
    }

    setLoading(true);

    try {
      const joinedOtp = otpDigits.join("");
      await verifyResetOTP({ email: email.trim(), otp: joinedOtp.trim() });
      setMessage("OTP verified successfully.");
      setStep("password");
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Invalid OTP";
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");
    setMessage("");

    if (newPassword !== confirmPassword) {
      setErrorMessage("New password and confirmation do not match.");
      return;
    }

    setLoading(true);
    try {
      const response = await resetForgottenPassword({
        email: email.trim(),
        otp: otpDigits.join("").trim(),
        newPassword,
      });
      setMessage(response.message || "Password reset successful.");
      setTimeout(() => navigate("/", { replace: true }), 1200);
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "Failed to reset password";
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleOtpDigitChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, "").slice(-1);
    const updated = [...otpDigits];
    updated[index] = digit;
    setOtpDigits(updated);

    if (digit && index < 3) {
      const nextInput = document.getElementById(`otp-${index + 1}`) as HTMLInputElement | null;
      nextInput?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !otpDigits[index] && index > 0) {
      const prevInput = document.getElementById(`otp-${index - 1}`) as HTMLInputElement | null;
      prevInput?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 4);
    if (!pasted) return;

    const updated = ["", "", "", ""];
    pasted.split("").forEach((ch, idx) => {
      updated[idx] = ch;
    });
    setOtpDigits(updated);

    const focusIndex = Math.min(Math.max(pasted.length - 1, 0), 3);
    const focusInput = document.getElementById(`otp-${focusIndex}`) as HTMLInputElement | null;
    focusInput?.focus();
  };

  return (
    <div className="forgot-container">
      <div className="forgot-bg-blob forgot-bg-blob--top" />
      <div className="forgot-bg-blob forgot-bg-blob--bottom" />

      <div className="forgot-header">
        <div className="forgot-logo">
          <img src={logo} alt="MTC Logo" className="forgot-logo-img" />
        </div>
        <h1 className="forgot-brand">MTC Namibia</h1>
        <p className="forgot-subtitle">Business Connect</p>
      </div>

      <div className="forgot-card">
        <h2 className="forgot-title">{stepTitle}</h2>
        <p className="forgot-help">
          {step === "email" &&
            "Enter your account email and we will send a 4-digit OTP."}
          {step === "otp" && "Enter the 4-digit code sent to your email."}
          {step === "password" && "Set your new password and confirm it."}
        </p>

        {step === "otp" && (
          <p className={`otp-timer ${otpExpired ? "otp-timer-expired" : ""}`}>
            OTP expires in {formatCountdown(secondsRemaining)}
          </p>
        )}

        {step === "email" && (
          <form className="forgot-form" onSubmit={handleSendOtp}>
            <div className="form-group">
              <label htmlFor="email">Email Address</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your.email@company.com"
                required
              />
            </div>
            <button type="submit" className="forgot-button" disabled={loading}>
              {loading ? "Sending..." : "Send OTP"}
            </button>
          </form>
        )}

        {step === "otp" && (
          <form className="forgot-form" onSubmit={handleVerifyOtp}>
            <div className="form-group">
              <label htmlFor="otp">4-digit OTP</label>
              <div className="otp-grid" onPaste={handleOtpPaste}>
                {otpDigits.map((digit, index) => (
                  <input
                    key={`otp-${index}`}
                    id={`otp-${index}`}
                    type="text"
                    value={digit}
                    onChange={(e) => handleOtpDigitChange(index, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(index, e)}
                    inputMode="numeric"
                    maxLength={1}
                    className="otp-digit-input"
                    aria-label={`OTP digit ${index + 1}`}
                    required
                  />
                ))}
              </div>
            </div>
            <button
              type="submit"
              className="forgot-button"
              disabled={loading || otpExpired || otpDigits.join("").length !== 4}
            >
              {loading ? "Verifying..." : "Verify OTP"}
            </button>
            <button
              type="button"
              className="forgot-link-button"
              disabled={loading}
              onClick={() => setStep("email")}
            >
              Change email
            </button>
            {otpExpired && (
              <button
                type="button"
                className="forgot-button resend-otp-button"
                disabled={loading}
                onClick={handleResendOtp}
              >
                {loading ? "Resending..." : "Resend OTP"}
              </button>
            )}
          </form>
        )}

        {step === "password" && (
          <form className="forgot-form" onSubmit={handleResetPassword}>
            <div className="form-group">
              <label htmlFor="newPassword">New Password</label>
              <input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Create a strong password"
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="confirmPassword">Confirm New Password</label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new password"
                required
              />
            </div>
            <button type="submit" className="forgot-button" disabled={loading}>
              {loading ? "Saving..." : "Reset Password"}
            </button>
          </form>
        )}

        {message && <p className="forgot-success">{message}</p>}
        {errorMessage && <p className="forgot-error">{errorMessage}</p>}

        <div className="forgot-footer">
          <button
            type="button"
            className="forgot-link-button"
            onClick={() => navigate("/", { replace: true })}
          >
            Back to Login
          </button>
        </div>
      </div>

      <style>{`
        * { box-sizing: border-box; }
        .forgot-container {
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
        .forgot-bg-blob {
          position: fixed;
          border-radius: 50%;
          pointer-events: none;
        }
        .forgot-bg-blob--top {
          top: -80px;
          left: -80px;
          width: 320px;
          height: 320px;
          background: radial-gradient(circle, rgba(26,122,191,0.12) 0%, transparent 70%);
        }
        .forgot-bg-blob--bottom {
          bottom: -60px;
          right: -60px;
          width: 280px;
          height: 280px;
          background: radial-gradient(circle, rgba(26,122,191,0.09) 0%, transparent 70%);
        }
        .forgot-header {
          text-align: center;
          margin-bottom: 22px;
          position: relative;
          z-index: 1;
        }
        .forgot-logo-img {
          width: 90px;
          height: 90px;
          object-fit: contain;
        }
        .forgot-brand {
          font-size: 1.8rem;
          color: #3b8fc7;
          font-weight: 500;
        }
        .forgot-subtitle {
          color: #6b7280;
          font-size: 0.9rem;
        }
        .forgot-card {
          background: rgba(255,255,255,0.94);
          backdrop-filter: blur(12px);
          border-radius: 20px;
          padding: 32px;
          width: 100%;
          max-width: 460px;
          box-shadow: 0 8px 40px rgba(26,122,191,0.12), 0 1px 3px rgba(0,0,0,0.06);
          border: 1px solid rgba(255,255,255,0.8);
          position: relative;
          z-index: 1;
          text-align: center;
        }
        .forgot-title {
          font-size: 1.3rem;
          margin-bottom: 6px;
          color: #111827;
          font-weight: 700;
        }
        .forgot-help {
          font-size: 0.9rem;
          color: #6b7280;
          margin-bottom: 20px;
        }
        .forgot-form {
          display: flex;
          flex-direction: column;
          gap: 12px;
          align-items: center;
        }
        .form-group {
          display: flex;
          flex-direction: column;
          gap: 7px;
          width: 100%;
          max-width: 320px;
          text-align: left;
        }
        .form-group label {
          font-size: 0.86rem;
          color: #374151;
          font-weight: 600;
        }
        .form-group input {
          width: 100%;
          padding: 12px 14px;
          border-radius: 10px;
          border: 2px solid #e5e7eb;
          background: #f8fafc;
          font-size: 0.9rem;
          outline: none;
        }
        .form-group input:focus {
          border-color: #3b8fc7;
        }
        .otp-grid {
          width: 100%;
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 10px;
        }
        .otp-digit-input {
          width: 100% !important;
          text-align: center;
          font-size: 1.05rem !important;
          font-weight: 700;
          padding: 12px 0 !important;
        }
        .forgot-button {
          margin-top: 6px;
          width: 100%;
          max-width: 320px;
          padding: 12px;
          border-radius: 10px;
          border: none;
          color: #fff;
          font-size: 0.95rem;
          font-weight: 600;
          cursor: pointer;
          background: linear-gradient(135deg, #3b8fc7 0%, #1565a8 100%);
        }
        .forgot-button:disabled {
          cursor: not-allowed;
          opacity: 0.75;
        }
        .resend-otp-button {
          margin-top: 2px;
          max-width: 220px;
        }
        .forgot-link-button {
          border: none;
          background: transparent;
          color: #3b8fc7;
          font-size: 0.88rem;
          cursor: pointer;
          margin-top: 6px;
          text-align: center;
        }
        .forgot-link-button:hover {
          text-decoration: underline;
        }
        .forgot-success {
          margin-top: 14px;
          color: #1f7a1f;
          font-size: 0.88rem;
          text-align: center;
        }
        .forgot-error {
          margin-top: 14px;
          color: #c62828;
          font-size: 0.88rem;
          text-align: center;
        }
        .forgot-footer {
          text-align: center;
          margin-top: 12px;
        }
        .otp-timer {
          font-size: 0.86rem;
          font-weight: 600;
          margin-bottom: 10px;
          color: #1565a8;
        }
        .otp-timer-expired {
          color: #c62828;
        }
      `}</style>
    </div>
  );
};

export default ForgotPassword;
