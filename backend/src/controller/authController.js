const securityService = require("../services/securityService");
const emailService = require("../services/emailService");
const { where } = require("sequelize");
const OTPModel = require("../models/otpModel");
const User = require("../models/User");
const Person = require("../models/Person");
const AccountManager = require("../models/AccountManager");
const GM = require("../models/GM");
const Manager = require("../models/Manager");
const ExecutiveStaff = require("../models/ExecutiveStaff");
const Corporate = require("../models/Corporate");
const Account = require("../models/Account");
const Service = require("../models/Service");
const Contract = require("../models/Contract");

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

    return res.status(201).json({
      status: "Success",
      message: "User registered successfully",
      user: newUser,
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
    // Check rate limiting by IP
    if (securityService.isRateLimited(req.ip)) {
      return res.status(429).json({
        status: "Failed",
        message: "Too many login attempts. Try again later.",
      });
    }

    // Find user by email
    const user = await User.findOne({ where: { email } });
    if (!user) {
      securityService.recordFailedAttempt(email);
      return res
        .status(401)
        .json({ status: "Failed", message: "Invalid credentials" });
    }

    // Check if account is already locked (without incrementing attempts)
    const failedAttemptData = securityService.getFailedAttemptStatus(email, 5);
    if (failedAttemptData.isLocked) {
      const minutesLeft = Math.ceil((failedAttemptData.lockedUntil - Date.now()) / 60000);
      return res.status(401).json({
        status: "Failed",
        message: `Account locked due to too many failed attempts. Try again in ${minutesLeft} minute${minutesLeft === 1 ? '' : 's'}.`,
        lockedUntil: new Date(failedAttemptData.lockedUntil).toISOString(),
        retryAfterMinutes: minutesLeft,
      });
    }

    // Compare password with hashed password
    const isPasswordValid = await securityService.compareData(
      password,
      user.password,
    );
    if (!isPasswordValid) {
      const attempt = securityService.recordFailedAttempt(email, 5, 15 * 60 * 1000);
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
      "8h",
    );

    // Generate refresh token (long-lived)
    const refreshToken = securityService.generateJWT(
      { userId: user.id },
      process.env.REFRESH_TOKEN_SECRET || process.env.JWT_SECRET,
      "7d",
    );

    // Clear failed attempts on successful login
    securityService.clearFailedAttempts(email);

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
      "15m",
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

    // Update user password
    await user.update({ password: hashedPassword });

    // Delete used OTP
    await storedOTP.destroy();

    // Clear any failed login attempts for this email
    securityService.clearFailedAttempts(email);

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
      const gm = await GM.findOne({ where: { userId: user.id } });
      if (gm) profile.roleProfileId = gm.gmId;
    } else if (user.role === "manager" || user.role === "supervisor") {
      const manager = await Manager.findOne({ where: { userId: user.id } });
      if (manager) {
        profile.roleProfileId = manager.managerId;
        profile.department = manager.department || profile.department;
      }
    } else if (user.role === "executive_staff") {
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
      const gm = await GM.findOne({ where: { userId: user.id } });
      if (gm) await gm.update(nameUpdates);
    } else if (user.role === "manager" || user.role === "supervisor") {
      const manager = await Manager.findOne({ where: { userId: user.id } });
      if (manager) await manager.update(nameUpdates);
    } else if (user.role === "executive_staff") {
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

    // Validate new password strength
    const passwordCheck = securityService.validatePasswordStrength(newPassword);
    if (!passwordCheck.isValid) {
      return res.status(400).json({
        status: "Failed",
        message: passwordCheck.feedback.join(", "),
      });
    }

    // Hash and save new password
    const hashedPassword = await securityService.hashData(newPassword);
    await user.update({ password: hashedPassword });

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

    if (user.role !== "executive_staff") {
      return res.status(403).json({ status: "Failed", message: "This endpoint is for executive staff only" });
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

    // For each account, fetch services and contracts counts + details
    const result = await Promise.all(
      accounts.map(async (acc) => {
        const services = await Service.findAll({ where: { accountId: acc.accountId } });
        const contracts = await Contract.findAll({ where: { accountId: acc.accountId } });
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
          services: services.map(s => ({
            serviceId: s.serviceId,
            msisdn: s.msisdn,
            serviceType: s.serviceType,
            status: s.status,
          })),
          contracts: contracts.map(c => ({
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
      })
    );

    return res.status(200).json({ status: "Success", accounts: result });
  } catch (error) {
    console.error("Get my accounts error:", error);
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

    const corporate = await Corporate.findByPk(accountManager.corporateId);
    if (!corporate) {
      return res.status(404).json({ status: "Failed", message: "Linked corporate not found" });
    }

    const accounts = await Account.findAll({
      where: { corporateId: corporate.corporateId },
      order: [["created_at", "DESC"]],
    });
    if (accounts.length === 0) {
      return res.status(404).json({ status: "Failed", message: "No accounts found under your corporate" });
    }

    const account = accounts[0];

    // Fetch the assigned executive staff
    let executive = null;
    if (account.executiveId) {
      const exec = await ExecutiveStaff.findByPk(account.executiveId);
      if (exec) {
        executive = {
          executiveId: exec.executiveId,
          firstName: exec.firstName,
          lastName: exec.lastName,
          email: exec.email,
          phone: exec.phone,
          region: exec.region,
        };
      }
    }

    const accountIds = accounts.map((a) => a.accountId);
    const services = await Service.findAll({ where: { accountId: accountIds } });
    const contracts = await Contract.findAll({ where: { accountId: accountIds } });
    const accountById = Object.fromEntries(accounts.map((a) => [a.accountId, a]));

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
      accountManager: {
        accountManagerId: accountManager.accountManagerId,
        firstName: accountManager.firstName,
        lastName: accountManager.lastName,
        email: accountManager.email,
        phone: accountManager.phone,
      },
      accounts: accounts.map((acc) => ({
        accountId: acc.accountId,
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
      })),
      // Backward compatibility for existing UI paths that still expect a single account object.
      account: {
        accountId: account.accountId,
        accountNumber: account.accountNumber,
        accountName: account.accountName,
        accountType: account.accountType,
        industry: account.industry,
        contactFirstName: account.contactFirstName,
        contactLastName: account.contactLastName,
        contactEmail: account.contactEmail,
        contactPhone: account.contactPhone,
        isActive: account.isActive,
        approvalStatus: account.approvalStatus,
        createdAt: account.createdAt,
      },
      executive,
      services: services.map(s => ({
        serviceId: s.serviceId,
        accountId: s.accountId,
        accountName: accountById[s.accountId]?.accountName || null,
        msisdn: s.msisdn,
        serviceType: s.serviceType,
        status: s.status,
      })),
      contracts: contracts.map(c => ({
        contractId: c.contractId,
        accountId: c.accountId,
        accountName: accountById[c.accountId]?.accountName || null,
        contractType: c.contractType,
        contractStartDate: c.contractStartDate,
        contractEndDate: c.contractEndDate,
        contractEffectiveDate: c.contractEffectiveDate,
        srNumber: c.srNumber,
        usageLimit: c.usageLimit,
        entitlement: c.entitlement,
        notes: c.notes,
      })),
    });
  } catch (error) {
    console.error("Get my account error:", error);
    return res.status(500).json({ status: "Failed", message: "Internal server error" });
  }
};
