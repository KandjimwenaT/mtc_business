const securityService = require("../services/securityService");
const emailService = require("../services/emailService");
const { Op } = require("sequelize");
const OTPModel = require("../models/otpModel");
const User = require("../models/User");
const Person = require("../models/Person");
const AccountManager = require("../models/AccountManager");
const CorporateContactPerson = require("../models/CorporateContactPerson");
const GM = require("../models/GM");
const Manager = require("../models/Manager");
const ExecutiveStaff = require("../models/ExecutiveStaff");
const Corporate = require("../models/Corporate");
const Account = require("../models/Account");
const Service = require("../models/Service");
const Contract = require("../models/Contract");
const Invoice = require("../models/Invoice");
const Notification = require("../models/Notification");
const { createForUserIds } = require("../services/notificationService");
const { recordAudit, actorDisplayName, clientIp } = require("../services/auditService");
const {
  getCorporateIdsForAccountManager,
  enrichAccountsWithCorporateContact,
  propagateContactPersonToCorporateAccounts,
} = require("../services/contactPersonService");

const hasExecutiveScope = (role) =>
  role === "executive_staff" || role === "supervisor";

const isoMonth = (dateValue) => {
  if (!dateValue) return "";
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 7);
};

const toMoney = (amount) => Number(amount || 0).toFixed(2);

exports.userRegistration = async (req, res) => {
  let { firstName, lastName, phone, email, password, role } = req.body;
  const allowedRoles = [
    "admin",
    "customer",
    "executive_staff",
    "supervisor",
    "manager",
    "gm",
  ];

  if (!firstName) {
    return res
      .status(400)
      .json({ status: "Failed", message: "First name is required" });
  }

  if (!lastName) {
    return res
      .status(400)
      .json({ status: "Failed", message: "Last name is required" });
  }

  if (!phone) {
    return res
      .status(400)
      .json({ status: "Failed", message: "Phone number is required" });
  }

  // Check if email is required/empty
  if (!email) {
    return res
      .status(400)
      .json({ status: "Failed", message: "Email is required" });
  }

  // Then validate email format
  if (!securityService.validateEmail(email)) {
    return res
      .status(400)
      .json({ status: "Failed", message: "Invalid email format" });
  }

  if (!password) {
    return res
      .status(400)
      .json({ status: "Failed", message: "Password is required" });
  }

  // Validate password strength
  const passwordCheck = securityService.validatePasswordStrength(password);
  if (!passwordCheck.isValid) {
    return res
      .status(400)
      .json({ status: "Failed", message: passwordCheck.feedback.join(", ") });
  }

  if (!role) {
    return res      .status(400)
      .json({ status: "Failed", message: "Role is required" });
  }

  role = String(role).toLowerCase();
  if (!allowedRoles.includes(role)) {
    return res.status(400).json({
      status: "Failed",
      message: `Invalid role. Allowed roles: ${allowedRoles.join(", ")}`,
    });
  }
  try {
    const existingUser = await User.findOne({ where: { email } });

    if (existingUser) {
      return res
        .status(400)
        .json({ status: "Failed", message: "Email already in use" });
    }

    // Hash the password
    const hashedPassword = await securityService.hashData(password);

    // Create user with hashed password
    const newUser = await User.create({
      firstName,
      lastName,
      phone,
      email,
      password: hashedPassword,
      role,
    });

    const { password: _pw, ...safeUser } = newUser.toJSON();
    return res.status(201).json({
      status: "Success",
      message: "User registered successfully",
      user: safeUser,
    });
  } catch (error) {
    console.error("Registration error:", error);
    return res
      .status(500)
      .json({ status: "Failed", message: "Internal server error" });
  }
};

exports.userLogin = async (req, res) => {
  const { email, password } = req.body;

  if (!email) {
    return res
      .status(400)
      .json({ status: "Failed", message: "Email is required" });
  }

  if (!password) {
    return res
      .status(400)
      .json({ status: "Failed", message: "Password is required" });
  }

  try {
    // Check lock before DB lookup to prevent timing-based enumeration
    const earlyLockCheck = securityService.getFailedAttemptStatus(email, 5);
    if (earlyLockCheck.isLocked) {
      const minutesLeft = Math.ceil((earlyLockCheck.lockedUntil - Date.now()) / 60000);
      return res.status(401).json({
        status: "Failed",
        message: `Account locked due to too many failed attempts. Try again in ${minutesLeft} minute${minutesLeft === 1 ? '' : 's'}.`,
        lockedUntil: new Date(earlyLockCheck.lockedUntil).toISOString(),
        retryAfterMinutes: minutesLeft,
      });
    }

    // Find user by email
    const user = await User.findOne({ where: { email } });
    if (!user) {
      securityService.recordFailedAttempt(email);
      recordAudit({
        actorName: email,
        actorEmail: email,
        actionType: "Auth",
        message: `Failed login attempt for ${email}`,
        ipAddress: clientIp(req),
      });
      return res
        .status(401)
        .json({ status: "Failed", message: "Invalid credentials" });
    }

    // Compare password with hashed password
    const isPasswordValid = await securityService.compareData(
      password,
      user.password,
    );
    if (!isPasswordValid) {
      const attempt = securityService.recordFailedAttempt(email, 5, 15 * 60 * 1000);
      recordAudit({
        user,
        actionType: "Auth",
        message: attempt.isLocked
          ? `Account locked after failed login attempts for ${email}`
          : `Failed login attempt for ${email}`,
        ipAddress: clientIp(req),
      });
      if (attempt.isLocked) {
        const minutesLeft = Math.ceil((attempt.lockedUntil - Date.now()) / 60000);
        return res.status(401).json({
          status: "Failed",
          message: `Account locked due to too many failed attempts. Try again in ${minutesLeft} minute${minutesLeft === 1 ? '' : 's'}.`,
          lockedUntil: new Date(attempt.lockedUntil).toISOString(),
          retryAfterMinutes: minutesLeft,
        });
      }
      const attemptsLeft = attempt.attemptsLeft ?? 0;
      return res.status(401).json({
        status: "Failed",
        message: attemptsLeft > 0
          ? `Invalid credentials. ${attemptsLeft} attempt${attemptsLeft === 1 ? '' : 's'} remaining before lockout.`
          : "Invalid credentials.",
      });
    }

    // Generate access token
    const accessToken = securityService.generateJWT(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      "1h",
    );

    // Generate refresh token (long-lived) — requires a dedicated secret
    const refreshSecret = process.env.REFRESH_TOKEN_SECRET;
    if (!refreshSecret) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('REFRESH_TOKEN_SECRET must be set in production');
      }
      console.warn('[auth] REFRESH_TOKEN_SECRET not set, falling back to JWT_SECRET');
    }
    const refreshToken = securityService.generateJWT(
      { userId: user.id },
      refreshSecret || process.env.JWT_SECRET,
      "7d",
    );

    // Clear failed attempts on successful login
    securityService.clearFailedAttempts(email);

    recordAudit({
      user,
      actionType: "Auth",
      message: `Logged in successfully`,
      ipAddress: clientIp(req),
    });

    return res.status(200).json({
      status: "Success",
      message: "Login successful",
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        firstName: user.firstName,
        email: user.email,
        role: user.role,
        mustChangePassword: Boolean(user.mustChangePassword),
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    return res
      .status(500)
      .json({ status: "Failed", message: "Internal server error" });
  }
};

// Add to securityService or authController
exports.refreshToken = async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res
      .status(400)
      .json({ status: "Failed", message: "Refresh token is required" });
  }

  try {
    // Verify refresh token
    const decoded = securityService.verifyJWT(
      refreshToken,
      process.env.REFRESH_TOKEN_SECRET || process.env.JWT_SECRET,
    );

    // Find user
    const user = await User.findByPk(decoded.userId);
    if (!user) {
      return res
        .status(401)
        .json({ status: "Failed", message: "User not found" });
    }

    // Generate new access token
    const newAccessToken = securityService.generateJWT(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      "1h",
    );

    return res.status(200).json({
      status: "Success",
      accessToken: newAccessToken,
    });
  } catch (error) {
    return res
      .status(401)
      .json({ status: "Failed", message: "Invalid refresh token" });
  }
};

exports.userLogout = async (req, res) => {
  const userId = req.user.id;

  try {
    console.log(`User ${userId} logged out successfully`);

    recordAudit({
      user: req.user,
      actionType: "Auth",
      message: "Logged out",
      ipAddress: clientIp(req),
    });

    return res.status(200).json({
      status: "Success",
      message: "Logout successful",
    });
  } catch (error) {
    console.error("Logout error:", error);
    return res
      .status(500)
      .json({ status: "Failed", message: "Internal server error" });
  }
};

exports.otpGeneration = async (req, res) => {
  const { email } = req.body;

  try {
    if (!email) {
      return res
        .status(400)
        .json({ status: "Failed", message: "Email is required" });
    }

    const existingOTP = await OTPModel.findOne({ where: { email } });

    if (existingOTP) {
      await existingOTP.destroy({ where: { email } });
    }

    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res
        .status(404)
        .json({ status: "Failed", message: "User not found" });
    }

    const otp = securityService.generateOTP(10);

    await OTPModel.create({
      userId: user.id,
      otp: otp.hashed,
      expiresAt: otp.expiresAt,
    });

    // Send OTP via email
    await emailService.sendOTPEmail(email, user.firstName, otp.code);

    return res.status(200).json({
      status: "Success",
      message: "OTP sent successfully to your email",
      expiresIn: otp.expiresIn,
    });
  } catch (error) {
    console.error("OTP Generation error:", error);
    return res
      .status(500)
      .json({
        status: "Failed",
        message: "Failed to generate OTP. Try again later.",
      });
  }
};

exports.validateOTP = async (req, res) => {
  const { email, otp } = req.body;

  // Validation
  if (!email) {
    return res
      .status(400)
      .json({ status: "Failed", message: "Email is required" });
  }

  if (!otp) {
    return res
      .status(400)
      .json({ status: "Failed", message: "OTP is required" });
  }

  if (!/^\d{4}$/.test(String(otp))) {
    return res
      .status(400)
      .json({ status: "Failed", message: "OTP must be a 4-digit code" });
  }

  try {
    // Find user
    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res
        .status(404)
        .json({ status: "Failed", message: "User not found" });
    }

    // Find stored OTP
    const storedOTP = await OTPModel.findOne({ where: { userId: user.id } });
    if (!storedOTP) {
      return res
        .status(400)
        .json({
          status: "Failed",
          message: "No OTP found. Please request a new one.",
        });
    }

    // Verify OTP using securityService
    const isValidOTP = securityService.verifyOTP(
      otp,
      storedOTP.otp,
      storedOTP.expiresAt,
    );

    if (!isValidOTP) {
      return res
        .status(401)
        .json({ status: "Failed", message: "Invalid or expired OTP" });
    }

    // Mark user as verified (if you have an isVerified column)
    await user.update({ isVerified: true });

    // Delete the used OTP
    await storedOTP.destroy();

    return res.status(200).json({
      status: "Success",
      message: "Email verified successfully",
      user: {
        id: user.id,
        firstName: user.firstName,
        email: user.email,
        isVerified: true,
      },
    });
  } catch (error) {
    console.error("OTP Validation error:", error);
    return res
      .status(500)
      .json({
        status: "Failed",
        message: "Failed to validate OTP. Try again later.",
      });
  }
};

exports.forgotPassword = async (req, res) => {
  const { email } = req.body;

  // Validation
  if (!email) {
    return res
      .status(400)
      .json({ status: "Failed", message: "Email is required" });
  }

  // Validate email format
  if (!securityService.validateEmail(email)) {
    return res
      .status(400)
      .json({ status: "Failed", message: "Invalid email format" });
  }

  try {
    // Find user
    const user = await User.findOne({ where: { email } });
    if (!user) {
      // Don't reveal if email exists for security
      return res.status(200).json({
        status: "Success",
        message: "If this email exists, a password reset OTP has been sent.",
      });
    }

    // Remove existing password-reset OTPs for this user
    await OTPModel.destroy({ where: { userId: user.id, type: "password_reset" } });

    // Generate OTP
    const otp = securityService.generateOTP(3); // 3 minute expiry for password reset

    // Save OTP to database
    await OTPModel.create({
      userId: user.id,
      otp: otp.hashed,
      expiresAt: otp.expiresAt,
      type: "password_reset", // Track OTP type
    });

    // Send OTP via email
    await emailService.sendPasswordResetOTPEmail(
      email,
      user.firstName,
      otp.code,
    );

    return res.status(200).json({
      status: "Success",
      message: "Password reset OTP sent to your email",
      expiresIn: otp.expiresIn,
    });
  } catch (error) {
    console.error("Forgot Password error:", error);
    return res
      .status(500)
      .json({
        status: "Failed",
        message: "Failed to process password reset. Try again later.",
      });
  }
};

exports.verifyResetOTP = async (req, res) => {
  const { email, otp } = req.body;

  if (!email) {
    return res
      .status(400)
      .json({ status: "Failed", message: "Email is required" });
  }

  if (!securityService.validateEmail(email)) {
    return res
      .status(400)
      .json({ status: "Failed", message: "Invalid email format" });
  }

  if (!otp) {
    return res
      .status(400)
      .json({ status: "Failed", message: "OTP is required" });
  }

  if (!/^\d{4}$/.test(String(otp))) {
    return res
      .status(400)
      .json({ status: "Failed", message: "OTP must be a 4-digit code" });
  }

  try {
    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res
        .status(404)
        .json({ status: "Failed", message: "User not found" });
    }

    const storedOTP = await OTPModel.findOne({
      where: { userId: user.id, type: "password_reset" },
    });

    if (!storedOTP) {
      return res
        .status(400)
        .json({
          status: "Failed",
          message: "No reset OTP found. Please request a new one.",
        });
    }

    const isValidOTP = securityService.verifyOTP(
      String(otp),
      storedOTP.otp,
      storedOTP.expiresAt,
    );

    if (!isValidOTP) {
      return res
        .status(401)
        .json({ status: "Failed", message: "Invalid or expired OTP" });
    }

    return res.status(200).json({
      status: "Success",
      message: "OTP verified successfully",
    });
  } catch (error) {
    console.error("Verify Reset OTP error:", error);
    return res
      .status(500)
      .json({
        status: "Failed",
        message: "Failed to verify OTP. Try again later.",
      });
  }
};

exports.resetPassword = async (req, res) => {
  const { email, otp, newPassword } = req.body;

  // Validation
  if (!email) {
    return res
      .status(400)
      .json({ status: "Failed", message: "Email is required" });
  }

  if (!otp) {
    return res
      .status(400)
      .json({ status: "Failed", message: "OTP is required" });
  }

  if (!newPassword) {
    return res
      .status(400)
      .json({ status: "Failed", message: "New password is required" });
  }

  // Validate password strength
  const passwordCheck = securityService.validatePasswordStrength(newPassword);
  if (!passwordCheck.isValid) {
    return res.status(400).json({
      status: "Failed",
      message: passwordCheck.feedback.join(", "),
    });
  }

  try {
    // Find user
    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res
        .status(404)
        .json({ status: "Failed", message: "User not found" });
    }

    // Find stored OTP
    const storedOTP = await OTPModel.findOne({
      where: { userId: user.id, type: "password_reset" },
    });
    if (!storedOTP) {
      return res
        .status(400)
        .json({
          status: "Failed",
          message: "No reset OTP found. Please request a new one.",
        });
    }

    // Verify OTP
    const isValidOTP = securityService.verifyOTP(
      otp,
      storedOTP.otp,
      storedOTP.expiresAt,
    );

    if (!isValidOTP) {
      return res
        .status(401)
        .json({ status: "Failed", message: "Invalid or expired OTP" });
    }

    // Hash new password
    const hashedPassword = await securityService.hashData(newPassword);

    // Update user password and clear the first-login flag
    await user.update({ password: hashedPassword, mustChangePassword: false });

    // Delete used OTP
    await storedOTP.destroy();

    // Clear any failed login attempts for this email
    securityService.clearFailedAttempts(email);

    recordAudit({
      user,
      actionType: "Auth",
      message: `Password reset completed for ${email}`,
      ipAddress: clientIp(req),
    });

    return res.status(200).json({
      status: "Success",
      message:
        "Password reset successfully. You can now login with your new password.",
      user: {
        id: user.id,
        firstName: user.firstName,
        email: user.email,
      },
    });
  } catch (error) {
    console.error("Reset Password error:", error);
    return res
      .status(500)
      .json({
        status: "Failed",
        message: "Failed to reset password. Try again later.",
      });
  }
};

// ── Get Current User Profile ─────────────────────────────────────
exports.getProfile = async (req, res) => {
  try {
    const user = req.user;

    // Build the profile response from the User record
    const profile = {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone,
      role: user.role,
      mustChangePassword: Boolean(user.mustChangePassword),
      department: null,
      region: null,
      personId: null,
      manager: null,
    };

    // Fetch the matching Person record (linked by email) for extra fields
    const person = await Person.findOne({ where: { email: user.email } });
    if (person) {
      profile.personId = person.id;
      profile.department = person.department;
      profile.region = person.region;
    }

    if (user.role === "customer") {
      const accountManager = await AccountManager.findOne({ where: { email: user.email } });
      if (accountManager) {
        profile.roleProfileId = accountManager.accountManagerId;
        profile.personId = accountManager.accountManagerId;
        const corporate = await Corporate.findByPk(accountManager.corporateId);
        profile.department = corporate?.corporateName || null;
        profile.region = corporate?.corporateType || null;
      }
    }

    // Fetch role-specific record for additional context
    if (user.role === "gm") {
      let gm = await GM.findOne({ where: { userId: user.id } });
      if (!gm && user.email) {
        gm = await GM.findOne({ where: { email: user.email } });
        if (gm && !gm.userId) await gm.update({ userId: user.id });
      }
      if (gm) profile.roleProfileId = gm.gmId;
    } else if (user.role === "manager" || user.role === "supervisor") {
      const manager = await Manager.findOne({ where: { userId: user.id } });
      if (manager) {
        profile.roleProfileId = manager.managerId;
        profile.department = manager.department || profile.department;
      }
    } else if (hasExecutiveScope(user.role)) {
      const exec = await ExecutiveStaff.findOne({ where: { userId: user.id } });
      if (exec) {
        profile.roleProfileId = exec.executiveId;
        profile.region = exec.region || profile.region;

        // Resolve manager details for executive dashboard/reporting line.
        let manager = null;
        if (exec.managerId) {
          manager = await Manager.findOne({ where: { managerId: exec.managerId } });

          // Compatibility fallback: executive.managerId may reference persons.id.
          if (!manager) {
            const managerPerson = await Person.findByPk(exec.managerId);
            if (managerPerson) {
              manager = await Manager.findOne({ where: { email: managerPerson.email } });
            }
          }
        }

        if (manager) {
          profile.manager = {
            managerId: manager.managerId,
            firstName: manager.firstName,
            lastName: manager.lastName,
            email: manager.email,
            department: manager.department || null,
          };
          profile.department = manager.department || profile.department;
        }
      }
    }

    return res.status(200).json({
      status: "Success",
      profile,
    });
  } catch (error) {
    console.error("Get profile error:", error);
    return res
      .status(500)
      .json({ status: "Failed", message: "Internal server error" });
  }
};

// ── Update Own Profile ───────────────────────────────────────────
exports.updateProfile = async (req, res) => {
  const { firstName, lastName, phone } = req.body;
  const user = req.user;

  if (!firstName && !lastName && !phone) {
    return res
      .status(400)
      .json({ status: "Failed", message: "At least one field is required to update" });
  }

  try {
    // Build update object with only provided fields
    const updates = {};
    if (firstName) updates.firstName = firstName;
    if (lastName) updates.lastName = lastName;
    if (phone !== undefined) updates.phone = phone;

    // Update User record
    await user.update(updates);

    // Update matching profile record (linked by email)
    const person = await Person.findOne({ where: { email: user.email } });
    if (person) {
      await person.update(updates);
    }
    if (user.role === "customer") {
      const accountManager = await AccountManager.findOne({ where: { email: user.email } });
      if (accountManager) {
        await accountManager.update(updates);
      }
    }

    // Update role-specific record
    const nameUpdates = {};
    if (firstName) nameUpdates.firstName = firstName;
    if (lastName) nameUpdates.lastName = lastName;
    if (phone !== undefined) nameUpdates.phone = phone;

    if (user.role === "gm") {
      let gm = await GM.findOne({ where: { userId: user.id } });
      if (!gm && user.email) gm = await GM.findOne({ where: { email: user.email } });
      if (gm) await gm.update(nameUpdates);
    } else if (user.role === "manager" || user.role === "supervisor") {
      const manager = await Manager.findOne({ where: { userId: user.id } });
      if (manager) await manager.update(nameUpdates);
    } else if (hasExecutiveScope(user.role)) {
      const exec = await ExecutiveStaff.findOne({ where: { userId: user.id } });
      if (exec) await exec.update(nameUpdates);
    }

    // Update localStorage data in response
    const updatedUser = await User.findByPk(user.id);

    // Fetch person again for full profile
    const updatedPerson = await Person.findOne({ where: { email: updatedUser.email } });
    const updatedAccountManager =
      user.role === "customer"
        ? await AccountManager.findOne({ where: { email: updatedUser.email } })
        : null;
    const updatedCorporate =
      updatedAccountManager?.corporateId
        ? await Corporate.findByPk(updatedAccountManager.corporateId)
        : null;

    const profile = {
      id: updatedUser.id,
      firstName: updatedUser.firstName,
      lastName: updatedUser.lastName,
      email: updatedUser.email,
      phone: updatedUser.phone,
      role: updatedUser.role,
      department:
        user.role === "customer"
          ? (updatedCorporate?.corporateName || null)
          : (updatedPerson?.department || null),
      region:
        user.role === "customer"
          ? (updatedCorporate?.corporateType || null)
          : (updatedPerson?.region || null),
      personId:
        user.role === "customer"
          ? (updatedAccountManager?.accountManagerId || null)
          : (updatedPerson?.id || null),
    };

    recordAudit({
      user,
      actionType: "Profile",
      message: `${actorDisplayName(user)} updated their profile`,
      ipAddress: clientIp(req),
    });

    return res.status(200).json({
      status: "Success",
      message: "Profile updated successfully",
      profile,
    });
  } catch (error) {
    console.error("Update profile error:", error);
    return res
      .status(500)
      .json({ status: "Failed", message: "Internal server error" });
  }
};

// ── Change Password (Authenticated) ─────────────────────────────
exports.changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const user = req.user;

  if (!currentPassword) {
    return res
      .status(400)
      .json({ status: "Failed", message: "Current password is required" });
  }

  if (!newPassword) {
    return res
      .status(400)
      .json({ status: "Failed", message: "New password is required" });
  }

  try {
    // Verify current password
    const isCurrentValid = await securityService.compareData(
      currentPassword,
      user.password,
    );

    if (!isCurrentValid) {
      return res
        .status(401)
        .json({ status: "Failed", message: "Current password is incorrect" });
    }

    if (currentPassword === newPassword) {
      return res.status(400).json({
        status: "Failed",
        message: "New password must be different from your one-time password",
      });
    }

    // Validate new password strength
    const passwordCheck = securityService.validatePasswordStrength(newPassword);
    if (!passwordCheck.isValid) {
      return res.status(400).json({
        status: "Failed",
        message: passwordCheck.feedback.join(", "),
      });
    }

    // Hash and save new password; one-time password is now spent
    const hashedPassword = await securityService.hashData(newPassword);
    await user.update({ password: hashedPassword, mustChangePassword: false });

    recordAudit({
      user,
      actionType: "Auth",
      message: `${actorDisplayName(user)} changed their password`,
      ipAddress: clientIp(req),
    });

    return res.status(200).json({
      status: "Success",
      message: "Password changed successfully",
    });
  } catch (error) {
    console.error("Change password error:", error);
    return res
      .status(500)
      .json({ status: "Failed", message: "Internal server error" });
  }
};

// ── Get Customer Account (for customer role) ─────────────────────
// ── Get Accounts Assigned to Executive ────────────────────────────
exports.getMyAccounts = async (req, res) => {
  try {
    const user = req.user;

    if (!hasExecutiveScope(user.role)) {
      return res.status(403).json({ status: "Failed", message: "This endpoint is for executive and supervisor users" });
    }

    const exec = await ExecutiveStaff.findOne({ where: { userId: user.id } });
    if (!exec) {
      return res.status(404).json({ status: "Failed", message: "Executive profile not found" });
    }

    const accounts = await Account.findAll({
      where: { executiveId: exec.executiveId },
      order: [["created_at", "DESC"]],
    });
    const corporateIds = [...new Set(accounts.map((acc) => acc.corporateId).filter((id) => Number.isInteger(id)))];
    const corporates = corporateIds.length
      ? await Corporate.findAll({ where: { corporateId: corporateIds } })
      : [];
    const corporateMap = Object.fromEntries(corporates.map((corp) => [corp.corporateId, corp]));
    const accountIds = accounts.map((acc) => acc.accountId);
    const monthKey = new Date().toISOString().slice(0, 7);
    const paidInvoices = accountIds.length
      ? await Invoice.findAll({
          where: {
            accountId: { [Op.in]: accountIds },
            status: "paid",
          },
          attributes: ["accountId", "corporateId", "amount", "paidAt"],
        })
      : [];
    const monthlyByAccount = {};
    const monthlyByCorporate = {};
    for (const invoice of paidInvoices) {
      if (isoMonth(invoice.paidAt) !== monthKey) continue;
      const amount = Number(invoice.amount || 0);
      monthlyByAccount[invoice.accountId] = (monthlyByAccount[invoice.accountId] || 0) + amount;
      if (invoice.corporateId) {
        monthlyByCorporate[invoice.corporateId] = (monthlyByCorporate[invoice.corporateId] || 0) + amount;
      }
    }

    // Two batch queries instead of 2 * N: fetch all services and contracts for
    // every account at once, then group by accountId in JS.
    const [allServices, allContracts] = accountIds.length
      ? await Promise.all([
          Service.findAll({ where: { accountId: { [Op.in]: accountIds } } }),
          Contract.findAll({ where: { accountId: { [Op.in]: accountIds } } }),
        ])
      : [[], []];

    const servicesByAccount = new Map();
    for (const s of allServices) {
      const list = servicesByAccount.get(s.accountId) || [];
      list.push(s);
      servicesByAccount.set(s.accountId, list);
    }
    const contractsByAccount = new Map();
    for (const c of allContracts) {
      const list = contractsByAccount.get(c.accountId) || [];
      list.push(c);
      contractsByAccount.set(c.accountId, list);
    }

    const result = accounts.map((acc) => {
      const services = servicesByAccount.get(acc.accountId) || [];
      const contracts = contractsByAccount.get(acc.accountId) || [];
      return {
        accountId: acc.accountId,
        corporateId: acc.corporateId || null,
        corporateName: acc.corporateId ? (corporateMap[acc.corporateId]?.corporateName || null) : null,
        accountNumber: acc.accountNumber,
        accountName: acc.accountName,
        accountType: acc.accountType,
        industry: acc.industry,
        contactFirstName: acc.contactFirstName,
        contactLastName: acc.contactLastName,
        contactEmail: acc.contactEmail,
        contactPhone: acc.contactPhone,
        isActive: acc.isActive,
        approvalStatus: acc.approvalStatus,
        createdAt: acc.createdAt,
        monthlySpending: toMoney(monthlyByAccount[acc.accountId] || 0),
        corporateMonthlySpending: toMoney(monthlyByCorporate[acc.corporateId] || 0),
        services: services.map((s) => ({
          serviceId: s.serviceId,
          msisdn: s.msisdn,
          serviceType: s.serviceType,
          status: s.status,
        })),
        contracts: contracts.map((c) => ({
          contractId: c.contractId,
          contractType: c.contractType,
          contractStartDate: c.contractStartDate,
          contractEndDate: c.contractEndDate,
          contractEffectiveDate: c.contractEffectiveDate,
          srNumber: c.srNumber,
          usageLimit: c.usageLimit,
          entitlement: c.entitlement,
          notes: c.notes,
        })),
      };
    });

    // Lazy fallback: fill in placeholder/empty per-account contact fields
    // from the corporate's contact person (legacy or junction-linked).
    await enrichAccountsWithCorporateContact(result);

    return res.status(200).json({ status: "Success", accounts: result });
  } catch (error) {
    console.error("Get my accounts error:", error);
    return res.status(500).json({ status: "Failed", message: "Internal server error" });
  }
};

// ── Get contracts expiring for current executive ───────────────────
exports.getMyExpiringContracts = async (req, res) => {
  try {
    const user = req.user;
    if (!hasExecutiveScope(user.role)) {
      return res.status(403).json({ status: "Failed", message: "This endpoint is for executive and supervisor users" });
    }

    const requestedMonths = Number(req.query.withinMonths || 6);
    const withinMonths = Number.isFinite(requestedMonths)
      ? Math.min(Math.max(Math.trunc(requestedMonths), 1), 24)
      : 6;

    const exec = await ExecutiveStaff.findOne({ where: { userId: user.id } });
    if (!exec) {
      return res.status(404).json({ status: "Failed", message: "Executive profile not found" });
    }

    const accounts = await Account.findAll({
      where: { executiveId: exec.executiveId },
      attributes: ["accountId", "accountName", "corporateId"],
    });
    if (!accounts.length) {
      return res.status(200).json({ status: "Success", contracts: [] });
    }

    const accountIds = accounts.map((account) => account.accountId);
    const accountById = new Map(accounts.map((account) => [account.accountId, account]));
    const corporateIds = [...new Set(accounts.map((a) => a.corporateId).filter((id) => Number.isInteger(id) && id > 0))];
    const corporates = corporateIds.length
      ? await Corporate.findAll({
          where: { corporateId: { [Op.in]: corporateIds } },
          attributes: ["corporateId", "corporateName"],
        })
      : [];
    const corporateNameById = new Map(corporates.map((corp) => [corp.corporateId, corp.corporateName]));

    const now = new Date();
    const startDate = now.toISOString().slice(0, 10);
    const cutoffDate = new Date(now);
    cutoffDate.setMonth(cutoffDate.getMonth() + withinMonths);
    const cutoffDateString = cutoffDate.toISOString().slice(0, 10);

    const contracts = await Contract.findAll({
      where: {
        accountId: { [Op.in]: accountIds },
        contractEndDate: {
          [Op.not]: null,
          [Op.gte]: startDate,
          [Op.lte]: cutoffDateString,
        },
      },
      order: [["contract_end_date", "ASC"]],
    });

    const executiveDisplayName = `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email;

    // Build the list of new alerts that need to be created without awaiting any
    // Notification.findOne / email send inside the request path.
    const candidateAlerts = [];
    const candidateTitles = [];
    for (const contract of contracts) {
      const account = accountById.get(contract.accountId);
      if (!account) continue;
      const corporateName = account.corporateId ? corporateNameById.get(account.corporateId) || null : null;
      const endDate = new Date(contract.contractEndDate);
      const daysRemaining = Math.max(0, Math.ceil((endDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)));
      const notificationTitle = `Contract Expiring Soon - ${account.accountName} (${contract.contractEndDate})`;
      candidateTitles.push(notificationTitle);
      candidateAlerts.push({
        contract,
        account,
        corporateName,
        daysRemaining,
        notificationTitle,
      });
    }

    // One query instead of N: load every existing alert title for this user.
    const existingAlerts = candidateTitles.length
      ? await Notification.findAll({
          where: {
            userId: user.id,
            type: "sla",
            title: { [Op.in]: candidateTitles },
          },
          attributes: ["title"],
        })
      : [];
    const existingTitleSet = new Set(existingAlerts.map((n) => n.title));

    // Fire-and-forget: don't block the HTTP response on notifications/emails.
    setImmediate(() => {
      (async () => {
        for (const item of candidateAlerts) {
          if (existingTitleSet.has(item.notificationTitle)) continue;
          try {
            await createForUserIds([user.id], {
              type: "sla",
              title: item.notificationTitle,
              message: `${item.corporateName || item.account.accountName} contract (${item.contract.contractType}) expires in ${item.daysRemaining} day(s).`,
              priority: item.daysRemaining <= 30 ? "high" : "normal",
              metadata: {
                kind: "contract_expiring",
                contractId: item.contract.contractId,
                accountId: item.account.accountId,
                corporateId: item.account.corporateId || null,
                contractEndDate: item.contract.contractEndDate,
                daysRemaining: item.daysRemaining,
              },
            });
          } catch (notifyErr) {
            console.error("Failed to create contract expiry notification:", notifyErr);
          }

          try {
            await emailService.sendContractExpiryAlertEmail(
              user.email,
              executiveDisplayName,
              item.corporateName || item.account.accountName,
              item.account.accountName,
              item.contract.contractType,
              item.contract.contractEndDate,
              item.daysRemaining,
            );
          } catch (emailErr) {
            console.error("Failed to send contract expiry email:", emailErr);
          }
        }
      })().catch((err) => console.error("Background contract expiry alert run failed:", err));
    });

    const mappedContracts = contracts.map((contract) => {
      const account = accountById.get(contract.accountId);
      const corporateName = account?.corporateId ? corporateNameById.get(account.corporateId) || null : null;
      const endDate = new Date(contract.contractEndDate);
      const daysRemaining = Math.max(0, Math.ceil((endDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)));
      return {
        contractId: contract.contractId,
        accountId: contract.accountId,
        corporateId: account?.corporateId || null,
        corporateName,
        accountName: account?.accountName || "Unknown Account",
        contractType: contract.contractType,
        contractEndDate: contract.contractEndDate,
        daysRemaining,
      };
    });

    return res.status(200).json({ status: "Success", contracts: mappedContracts });
  } catch (error) {
    console.error("Get my expiring contracts error:", error);
    return res.status(500).json({ status: "Failed", message: "Internal server error" });
  }
};

exports.getMyMonthlySpendingSummary = async (req, res) => {
  try {
    const user = req.user;
    if (!hasExecutiveScope(user.role)) {
      return res.status(403).json({ status: "Failed", message: "This endpoint is for executive and supervisor users" });
    }

    const exec = await ExecutiveStaff.findOne({ where: { userId: user.id } });
    if (!exec) {
      return res.status(404).json({ status: "Failed", message: "Executive profile not found" });
    }

    const accounts = await Account.findAll({
      where: { executiveId: exec.executiveId },
      attributes: ["accountId", "corporateId"],
    });
    const accountIds = accounts.map((a) => a.accountId);
    if (!accountIds.length) {
      return res.status(200).json({ status: "Success", summary: { total: "0.00", currency: "NAD", byCorporate: {}, byAccount: {} } });
    }

    const monthKey = new Date().toISOString().slice(0, 7);
    const paidInvoices = await Invoice.findAll({
      where: { accountId: { [Op.in]: accountIds }, status: "paid" },
      attributes: ["accountId", "corporateId", "amount", "paidAt"],
    });
    const byCorporate = {};
    const byAccount = {};
    let total = 0;
    for (const invoice of paidInvoices) {
      if (isoMonth(invoice.paidAt) !== monthKey) continue;
      const amount = Number(invoice.amount || 0);
      total += amount;
      byAccount[invoice.accountId] = Number((byAccount[invoice.accountId] || 0) + amount);
      if (invoice.corporateId) byCorporate[invoice.corporateId] = Number((byCorporate[invoice.corporateId] || 0) + amount);
    }

    return res.status(200).json({
      status: "Success",
      summary: {
        total: toMoney(total),
        currency: "NAD",
        byCorporate: Object.fromEntries(Object.entries(byCorporate).map(([k, v]) => [k, toMoney(v)])),
        byAccount: Object.fromEntries(Object.entries(byAccount).map(([k, v]) => [k, toMoney(v)])),
      },
    });
  } catch (error) {
    console.error("Get my monthly spending summary error:", error);
    return res.status(500).json({ status: "Failed", message: "Internal server error" });
  }
};

exports.getMyMonthlySpendingTrend = async (req, res) => {
  try {
    const user = req.user;
    if (!hasExecutiveScope(user.role)) {
      return res.status(403).json({ status: "Failed", message: "This endpoint is for executive and supervisor users" });
    }
    const requestedMonths = Number(req.query.months || 6);
    const months = Number.isFinite(requestedMonths) ? Math.min(Math.max(Math.trunc(requestedMonths), 3), 24) : 6;

    const exec = await ExecutiveStaff.findOne({ where: { userId: user.id } });
    if (!exec) {
      return res.status(404).json({ status: "Failed", message: "Executive profile not found" });
    }

    const accounts = await Account.findAll({ where: { executiveId: exec.executiveId }, attributes: ["accountId"] });
    const accountIds = accounts.map((a) => a.accountId);
    if (!accountIds.length) return res.status(200).json({ status: "Success", trend: [] });

    const invoices = await Invoice.findAll({
      where: { accountId: { [Op.in]: accountIds }, status: "paid" },
      attributes: ["amount", "paidAt"],
    });
    const monthTotals = {};
    for (const invoice of invoices) {
      const month = isoMonth(invoice.paidAt);
      if (!month) continue;
      monthTotals[month] = Number((monthTotals[month] || 0) + Number(invoice.amount || 0));
    }

    const trend = [];
    const pivot = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    for (let i = months - 1; i >= 0; i -= 1) {
      const d = new Date(pivot.getFullYear(), pivot.getMonth() - i, 1);
      const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      trend.push({ month: m, total: toMoney(monthTotals[m] || 0), currency: "NAD" });
    }

    return res.status(200).json({ status: "Success", trend });
  } catch (error) {
    console.error("Get my monthly spending trend error:", error);
    return res.status(500).json({ status: "Failed", message: "Internal server error" });
  }
};

exports.getMyAccount = async (req, res) => {
  try {
    const user = req.user;

    if (user.role !== "customer") {
      return res.status(403).json({ status: "Failed", message: "This endpoint is for customer users only" });
    }

    // Customer access is linked to AccountManager -> Corporate (not account contact email).
    const accountManager = await AccountManager.findOne({ where: { email: user.email } });
    if (!accountManager) {
      return res.status(404).json({ status: "Failed", message: "No corporate linked to your access" });
    }

    // A contact person can be linked to multiple corporates (legacy primary
    // AccountManager.corporateId + corporate_contact_persons junction table).
    const linkedCorporateIds = await getCorporateIdsForAccountManager(accountManager);
    if (linkedCorporateIds.length === 0) {
      return res.status(404).json({ status: "Failed", message: "No corporate linked to your access" });
    }

    const linkedCorporates = await Corporate.findAll({
      where: { corporateId: linkedCorporateIds },
    });
    if (linkedCorporates.length === 0) {
      return res.status(404).json({ status: "Failed", message: "Linked corporate not found" });
    }

    // Keep the AM's primary corporate first for backward-compatible fields,
    // then any additional junction-linked corporates after it.
    const primaryCorporateId = accountManager.corporateId;
    linkedCorporates.sort((a, b) => {
      if (a.corporateId === primaryCorporateId) return -1;
      if (b.corporateId === primaryCorporateId) return 1;
      return a.corporateName.localeCompare(b.corporateName);
    });
    const corporate = linkedCorporates[0];
    const corporateById = Object.fromEntries(
      linkedCorporates.map((c) => [c.corporateId, c])
    );

    const accounts = await Account.findAll({
      where: { corporateId: linkedCorporateIds },
      order: [["created_at", "DESC"]],
    });
    if (accounts.length === 0) {
      return res.status(404).json({ status: "Failed", message: "No accounts found under your corporate" });
    }

    const account = accounts.find((a) => a.corporateId === corporate.corporateId) || accounts[0];

    async function serializeExecutive(executiveProfileId) {
      if (!executiveProfileId) return null;
      const exec = await ExecutiveStaff.findByPk(executiveProfileId);
      if (!exec) return null;
      return {
        executiveId: exec.executiveId,
        firstName: exec.firstName,
        lastName: exec.lastName,
        email: exec.email,
        phone: exec.phone,
        region: exec.region,
      };
    }

    const corporateExecutives = await Promise.all(
      linkedCorporates.map(async (corp) => ({
        corporateId: corp.corporateId,
        corporateName: corp.corporateName,
        executive: await serializeExecutive(corp.executiveId),
      }))
    );

    // Corporate assignment is the source of truth for the account executive.
    let executive =
      corporateExecutives.find((entry) => entry.corporateId === corporate.corporateId)?.executive
      || null;
    if (!executive) {
      const fallbackAccount = accounts.find(
        (a) => a.corporateId === corporate.corporateId && a.executiveId
      );
      executive = await serializeExecutive(fallbackAccount?.executiveId || null);
    }

    const accountIds = accounts.map((a) => a.accountId);
    const services = await Service.findAll({ where: { accountId: { [Op.in]: accountIds } } });
    const serviceIds = services.map((s) => s.serviceId);
    const contractOr = [{ accountId: { [Op.in]: accountIds } }];
    if (serviceIds.length > 0) {
      contractOr.push({ serviceId: { [Op.in]: serviceIds } });
    }
    const contracts = await Contract.findAll({ where: { [Op.or]: contractOr } });
    const paidInvoices = await Invoice.findAll({
      where: { accountId: { [Op.in]: accountIds }, status: "paid" },
      attributes: ["accountId", "amount", "paidAt"],
    });
    const accountById = Object.fromEntries(accounts.map((a) => [a.accountId, a]));
    const serviceById = Object.fromEntries(services.map((s) => [s.serviceId, s]));
    const monthKey = new Date().toISOString().slice(0, 7);
    const monthlySpendingByAccount = {};
    let monthlyCorporateSpending = 0;
    for (const invoice of paidInvoices) {
      if (isoMonth(invoice.paidAt) !== monthKey) continue;
      const amount = Number(invoice.amount || 0);
      monthlyCorporateSpending += amount;
      monthlySpendingByAccount[invoice.accountId] = (monthlySpendingByAccount[invoice.accountId] || 0) + amount;
    }

    const accountsPayload = accounts.map((acc) => ({
      accountId: acc.accountId,
      corporateId: acc.corporateId,
      corporateName: corporateById[acc.corporateId]?.corporateName || null,
      accountNumber: acc.accountNumber,
      accountName: acc.accountName,
      accountType: acc.accountType,
      industry: acc.industry,
      contactFirstName: acc.contactFirstName,
      contactLastName: acc.contactLastName,
      contactEmail: acc.contactEmail,
      contactPhone: acc.contactPhone,
      isActive: acc.isActive,
      approvalStatus: acc.approvalStatus,
      createdAt: acc.createdAt,
      monthlySpending: toMoney(monthlySpendingByAccount[acc.accountId] || 0),
    }));
    // Lazy fallback: fill in placeholder/empty per-account contact fields
    // from the corporate's contact person (legacy or junction-linked).
    await enrichAccountsWithCorporateContact(accountsPayload);
    const primaryAccountPayload = accountsPayload.find(
      (a) => a.accountId === account.accountId
    ) || accountsPayload[0];

    return res.status(200).json({
      status: "Success",
      corporate: {
        corporateId: corporate.corporateId,
        corporateNumber: corporate.corporateNumber,
        corporateName: corporate.corporateName,
        corporateType: corporate.corporateType,
        businessEmail: corporate.businessEmail,
        industry: corporate.industry,
      },
      corporates: linkedCorporates.map((corp) => ({
        corporateId: corp.corporateId,
        corporateNumber: corp.corporateNumber,
        corporateName: corp.corporateName,
        corporateType: corp.corporateType,
        businessEmail: corp.businessEmail,
        industry: corp.industry,
      })),
      accountManager: {
        accountManagerId: accountManager.accountManagerId,
        firstName: accountManager.firstName,
        lastName: accountManager.lastName,
        email: accountManager.email,
        phone: accountManager.phone,
      },
      accounts: accountsPayload,
      // Backward compatibility for existing UI paths that still expect a single account object.
      account: primaryAccountPayload,
      spendingSummary: {
        corporateMonthlySpending: toMoney(monthlyCorporateSpending),
        currency: "NAD",
      },
      executive,
      corporateExecutives,
      services: services.map(s => ({
        serviceId: s.serviceId,
        accountId: s.accountId,
        accountName: accountById[s.accountId]?.accountName || null,
        msisdn: s.msisdn,
        serviceType: s.serviceType,
        status: s.status,
      })),
      contracts: contracts.map((c) => {
        const resolvedAccountId =
          c.accountId != null
            ? c.accountId
            : c.serviceId
              ? serviceById[c.serviceId]?.accountId ?? null
              : null;
        return {
          contractId: c.contractId,
          accountId: resolvedAccountId,
          serviceId: c.serviceId,
          accountName:
            resolvedAccountId != null ? accountById[resolvedAccountId]?.accountName || null : null,
          contractType: c.contractType,
          contractStartDate: c.contractStartDate,
          contractEndDate: c.contractEndDate,
          contractEffectiveDate: c.contractEffectiveDate,
          srNumber: c.srNumber,
          usageLimit: c.usageLimit,
          entitlement: c.entitlement,
          notes: c.notes,
        };
      }),
    });
  } catch (error) {
    console.error("Get my account error:", error);
    return res.status(500).json({ status: "Failed", message: "Internal server error" });
  }
};

// ── Executive-scoped corporate contact persons ──────────────────────
//
// Executives (and supervisors with executive scope) can manage the
// contact persons of corporates they own. A corporate is "owned" by an
// executive when either Corporate.executiveId matches their executive
// profile or at least one Account under that corporate is assigned to
// them. Ownership is checked on every mutation so executives can never
// touch corporates outside their book of business.

const serializeAccountManagerAsContactPerson = (am, corporateName = null) => ({
  id: am.accountManagerId,
  firstName: am.firstName,
  lastName: am.lastName,
  email: am.email,
  phone: am.phone,
  type: "customer",
  region: null,
  department: corporateName,
  gmId: null,
  managerId: null,
  corporateId: am.corporateId,
  hasPortalAccess: am.hasPortalAccess,
  created_at: am.createdAt,
});

const resolveExecutiveStaffForUser = async (user) => {
  if (!user || !hasExecutiveScope(user.role)) return null;
  return ExecutiveStaff.findOne({ where: { userId: user.id } });
};

const getOwnedCorporateIdsForExecutive = async (exec) => {
  if (!exec) return [];
  const [corporateRows, accountRows] = await Promise.all([
    Corporate.findAll({
      where: { executiveId: exec.executiveId },
      attributes: ["corporateId"],
    }),
    Account.findAll({
      where: { executiveId: exec.executiveId },
      attributes: ["corporateId"],
    }),
  ]);
  const ids = new Set();
  for (const c of corporateRows) {
    if (Number.isInteger(c.corporateId)) ids.add(c.corporateId);
  }
  for (const a of accountRows) {
    if (Number.isInteger(a.corporateId)) ids.add(a.corporateId);
  }
  return [...ids];
};

const assertExecutiveOwnsCorporate = async (corporateIdRaw, user) => {
  const corporateId = Number(corporateIdRaw);
  if (!Number.isInteger(corporateId)) {
    return { error: { status: 400, message: "Valid corporate ID is required" } };
  }
  if (!hasExecutiveScope(user?.role)) {
    return { error: { status: 403, message: "This endpoint is for executive and supervisor users" } };
  }
  const exec = await resolveExecutiveStaffForUser(user);
  if (!exec) {
    return { error: { status: 404, message: "Executive profile not found" } };
  }
  const corporate = await Corporate.findByPk(corporateId);
  if (!corporate) {
    return { error: { status: 404, message: "Corporate not found" } };
  }
  const isDirectlyAssigned = corporate.executiveId === exec.executiveId;
  if (!isDirectlyAssigned) {
    const linkedAccount = await Account.findOne({
      where: { corporateId: corporate.corporateId, executiveId: exec.executiveId },
      attributes: ["accountId"],
    });
    if (!linkedAccount) {
      return { error: { status: 403, message: "You do not have access to this corporate" } };
    }
  }
  return { exec, corporate };
};

const listContactPersonsForCorporateInternal = async (corporateId) => {
  const numericId = Number(corporateId);
  if (!Number.isInteger(numericId)) return [];
  const [primary, junction] = await Promise.all([
    AccountManager.findAll({ where: { corporateId: numericId } }),
    CorporateContactPerson.findAll({ where: { corporateId: numericId } }),
  ]);
  const junctionAmIds = junction
    .map((j) => j.accountManagerId)
    .filter((id) => Number.isInteger(id));
  const junctionAms = junctionAmIds.length
    ? await AccountManager.findAll({ where: { accountManagerId: junctionAmIds } })
    : [];
  const seen = new Set();
  const all = [];
  for (const am of [...primary, ...junctionAms]) {
    if (!am || seen.has(am.accountManagerId)) continue;
    seen.add(am.accountManagerId);
    all.push(am);
  }
  return all;
};

// Business rule (executive scope): a corporate may have at most one
// contact person at a time. Use this to reject add/create requests when
// a contact already exists; the executive must remove the current one
// first.
const corporateAlreadyHasContactPerson = async (corporateId, excludeAccountManagerId = null) => {
  const ams = await listContactPersonsForCorporateInternal(corporateId);
  return ams.some((am) => am.accountManagerId !== excludeAccountManagerId);
};

// Undo the contact mirroring done by propagateContactPersonToCorporateAccounts.
// We only blank out per-account contact fields that still match the contact
// person we're removing, so manually-entered, account-specific contacts are
// left untouched.
const clearMirroredContactFromCorporateAccounts = async (corporateId, accountManager) => {
  if (!corporateId || !accountManager) return 0;
  const removedFirst = (accountManager.firstName || "").trim().toLowerCase();
  const removedLast = (accountManager.lastName || "").trim().toLowerCase();
  const removedEmail = (accountManager.email || "").trim().toLowerCase();
  const accounts = await Account.findAll({ where: { corporateId } });
  let cleared = 0;
  for (const acc of accounts) {
    const accFirst = (acc.contactFirstName || "").trim().toLowerCase();
    const accLast = (acc.contactLastName || "").trim().toLowerCase();
    const accEmail = (acc.contactEmail || "").trim().toLowerCase();
    const matchesRemoved =
      (!!removedEmail && accEmail === removedEmail) ||
      (!!removedFirst && !!removedLast && accFirst === removedFirst && accLast === removedLast);
    if (!matchesRemoved) continue;
    await acc.update({
      contactFirstName: "",
      contactLastName: "",
      contactEmail: "",
      contactPhone: null,
    });
    cleared += 1;
  }
  return cleared;
};

// GET /auth/my-corporates
exports.getMyCorporates = async (req, res) => {
  try {
    const user = req.user;
    if (!hasExecutiveScope(user.role)) {
      return res.status(403).json({ status: "Failed", message: "This endpoint is for executive and supervisor users" });
    }
    const exec = await resolveExecutiveStaffForUser(user);
    if (!exec) {
      return res.status(404).json({ status: "Failed", message: "Executive profile not found" });
    }
    const ids = await getOwnedCorporateIdsForExecutive(exec);
    if (ids.length === 0) {
      return res.status(200).json({ status: "Success", corporates: [] });
    }
    const corporates = await Corporate.findAll({
      where: { corporateId: ids },
      order: [["corporate_name", "ASC"]],
    });
    return res.status(200).json({ status: "Success", corporates });
  } catch (error) {
    console.error("Get my corporates error:", error);
    return res.status(500).json({ status: "Failed", message: "Internal server error" });
  }
};

// GET /auth/my-account-managers
// Returns the contact persons (AccountManagers) already linked to any of
// the executive's owned corporates, so they can be picked and re-linked
// to additional corporates in the executive's book.
exports.getMyAccountManagers = async (req, res) => {
  try {
    const user = req.user;
    if (!hasExecutiveScope(user.role)) {
      return res.status(403).json({ status: "Failed", message: "This endpoint is for executive and supervisor users" });
    }
    const exec = await resolveExecutiveStaffForUser(user);
    if (!exec) {
      return res.status(404).json({ status: "Failed", message: "Executive profile not found" });
    }
    const corporateIds = await getOwnedCorporateIdsForExecutive(exec);
    if (corporateIds.length === 0) {
      return res.status(200).json({ status: "Success", persons: [] });
    }
    const [primary, junction] = await Promise.all([
      AccountManager.findAll({ where: { corporateId: corporateIds } }),
      CorporateContactPerson.findAll({ where: { corporateId: corporateIds } }),
    ]);
    const amIds = new Set();
    const ams = [];
    for (const am of primary) {
      if (amIds.has(am.accountManagerId)) continue;
      amIds.add(am.accountManagerId);
      ams.push(am);
    }
    const missingIds = junction
      .map((j) => j.accountManagerId)
      .filter((id) => Number.isInteger(id) && !amIds.has(id));
    if (missingIds.length > 0) {
      const extras = await AccountManager.findAll({ where: { accountManagerId: missingIds } });
      for (const am of extras) {
        if (amIds.has(am.accountManagerId)) continue;
        amIds.add(am.accountManagerId);
        ams.push(am);
      }
    }
    const corporates = await Corporate.findAll({ where: { corporateId: corporateIds } });
    const corpMap = Object.fromEntries(corporates.map((c) => [c.corporateId, c]));
    const persons = ams.map((am) =>
      serializeAccountManagerAsContactPerson(am, corpMap[am.corporateId]?.corporateName || null)
    );
    return res.status(200).json({ status: "Success", persons });
  } catch (error) {
    console.error("Get my account managers error:", error);
    return res.status(500).json({ status: "Failed", message: "Internal server error" });
  }
};

// GET /auth/my-corporates/:corporateId/contact-persons
exports.getMyCorporateContactPersons = async (req, res) => {
  try {
    const ownership = await assertExecutiveOwnsCorporate(req.params.corporateId, req.user);
    if (ownership.error) {
      return res.status(ownership.error.status).json({ status: "Failed", message: ownership.error.message });
    }
    const { corporate } = ownership;
    const ams = await listContactPersonsForCorporateInternal(corporate.corporateId);
    const persons = ams.map((am) => serializeAccountManagerAsContactPerson(am, corporate.corporateName));
    return res.status(200).json({ status: "Success", persons });
  } catch (error) {
    console.error("Get my corporate contact persons error:", error);
    return res.status(500).json({ status: "Failed", message: "Internal server error" });
  }
};

// POST /auth/my-corporates/:corporateId/contact-persons   body: { accountManagerId }
exports.assignContactPersonToMyCorporate = async (req, res) => {
  try {
    const ownership = await assertExecutiveOwnsCorporate(req.params.corporateId, req.user);
    if (ownership.error) {
      return res.status(ownership.error.status).json({ status: "Failed", message: ownership.error.message });
    }
    const { corporate } = ownership;
    const { accountManagerId } = req.body || {};
    if (!accountManagerId) {
      return res.status(400).json({ status: "Failed", message: "Contact person ID is required" });
    }
    const accountManager = await AccountManager.findByPk(accountManagerId);
    if (!accountManager) {
      return res.status(404).json({ status: "Failed", message: "Contact person not found" });
    }

    if (accountManager.corporateId === corporate.corporateId) {
      return res.status(200).json({
        status: "Success",
        message: "Contact person is already linked to this corporate",
        person: serializeAccountManagerAsContactPerson(accountManager, corporate.corporateName),
      });
    }

    // Only one contact person per corporate.
    if (await corporateAlreadyHasContactPerson(corporate.corporateId, accountManager.accountManagerId)) {
      return res.status(400).json({
        status: "Failed",
        message:
          "This corporate already has a contact person. Remove the existing one before assigning a new contact.",
      });
    }

    const [, created] = await CorporateContactPerson.findOrCreate({
      where: {
        corporateId: corporate.corporateId,
        accountManagerId: accountManager.accountManagerId,
      },
      defaults: {
        corporateId: corporate.corporateId,
        accountManagerId: accountManager.accountManagerId,
      },
    });

    try {
      await propagateContactPersonToCorporateAccounts(corporate.corporateId, accountManager);
    } catch (propagationError) {
      console.error("Propagate contact to corporate accounts failed:", propagationError);
    }

    return res.status(created ? 201 : 200).json({
      status: "Success",
      message: created
        ? "Contact person linked to corporate"
        : "Contact person is already linked to this corporate",
      person: serializeAccountManagerAsContactPerson(accountManager, corporate.corporateName),
    });
  } catch (error) {
    console.error("Assign contact person to my corporate error:", error);
    return res.status(500).json({ status: "Failed", message: "Internal server error" });
  }
};

// DELETE /auth/my-corporates/:corporateId/contact-persons/:accountManagerId
exports.removeContactPersonFromMyCorporate = async (req, res) => {
  try {
    const ownership = await assertExecutiveOwnsCorporate(req.params.corporateId, req.user);
    if (ownership.error) {
      return res.status(ownership.error.status).json({ status: "Failed", message: ownership.error.message });
    }
    const { corporate } = ownership;
    const { accountManagerId } = req.params;
    if (!accountManagerId) {
      return res.status(400).json({ status: "Failed", message: "Contact person ID is required" });
    }
    const accountManager = await AccountManager.findByPk(accountManagerId);
    if (!accountManager) {
      return res.status(404).json({ status: "Failed", message: "Contact person not found" });
    }

    // Drop the junction link for this corporate (no-op if it wasn't there).
    const removedJunction = await CorporateContactPerson.destroy({
      where: {
        corporateId: corporate.corporateId,
        accountManagerId: accountManager.accountManagerId,
      },
    });

    const isPrimaryHere = accountManager.corporateId === corporate.corporateId;
    if (isPrimaryHere) {
      // If the contact also lives on other corporates (junction links),
      // promote one of those to be its new primary corporate.
      const remaining = await CorporateContactPerson.findOne({
        where: { accountManagerId: accountManager.accountManagerId },
      });
      if (remaining) {
        await accountManager.update({ corporateId: remaining.corporateId });
        await CorporateContactPerson.destroy({
          where: {
            corporateId: remaining.corporateId,
            accountManagerId: accountManager.accountManagerId,
          },
        });
      } else if (accountManager.hasPortalAccess) {
        // We can't safely orphan a contact that still has portal login
        // credentials — revoke those first via the admin tools.
        return res.status(400).json({
          status: "Failed",
          message:
            "This contact has portal access. Revoke their portal access before removing them from their only corporate.",
        });
      } else {
        // No other corporate to fall back to and no portal access:
        // delete the contact record entirely so the corporate is left
        // with no contact person (which is the intended state).
        await accountManager.destroy();
      }
    } else if (!removedJunction) {
      return res.status(404).json({
        status: "Failed",
        message: "Contact person is not linked to this corporate",
      });
    }

    // Clear the mirrored contact fields on the corporate's child accounts
    // whenever the contact we just removed matches what was propagated.
    try {
      await clearMirroredContactFromCorporateAccounts(corporate.corporateId, accountManager);
    } catch (clearErr) {
      console.error("Clear propagated contact fields failed:", clearErr);
    }

    return res.status(200).json({
      status: "Success",
      message: "Contact person removed from corporate",
    });
  } catch (error) {
    console.error("Remove contact person from my corporate error:", error);
    return res.status(500).json({ status: "Failed", message: "Internal server error" });
  }
};

// POST /auth/my-corporates/:corporateId/contact-persons/new
// body: { firstName, lastName, email, phone? }
exports.createContactPersonForMyCorporate = async (req, res) => {
  try {
    const ownership = await assertExecutiveOwnsCorporate(req.params.corporateId, req.user);
    if (ownership.error) {
      return res.status(ownership.error.status).json({ status: "Failed", message: ownership.error.message });
    }
    const { corporate } = ownership;
    const { firstName, lastName, email, phone } = req.body || {};

    if (!firstName || !lastName || !email) {
      return res.status(400).json({
        status: "Failed",
        message: "First name, last name and email are required",
      });
    }
    if (!securityService.validateEmail(email)) {
      return res.status(400).json({ status: "Failed", message: "Invalid email format" });
    }

    // Only one contact person per corporate.
    if (await corporateAlreadyHasContactPerson(corporate.corporateId)) {
      return res.status(400).json({
        status: "Failed",
        message:
          "This corporate already has a contact person. Remove the existing one before creating a new contact.",
      });
    }

    const existing = await AccountManager.findOne({ where: { email } });
    if (existing) {
      return res
        .status(400)
        .json({ status: "Failed", message: "A contact person with this email already exists" });
    }

    const accountManager = await AccountManager.create({
      firstName,
      lastName,
      email,
      phone: phone || null,
      corporateId: corporate.corporateId,
      hasPortalAccess: false,
    });

    try {
      await propagateContactPersonToCorporateAccounts(corporate.corporateId, accountManager);
    } catch (propagationError) {
      console.error("Propagate contact to corporate accounts failed:", propagationError);
    }

    return res.status(201).json({
      status: "Success",
      message: "Contact person created and linked",
      person: serializeAccountManagerAsContactPerson(accountManager, corporate.corporateName),
    });
  } catch (error) {
    console.error("Create contact person for my corporate error:", error);
    return res.status(500).json({ status: "Failed", message: "Internal server error" });
  }
};
