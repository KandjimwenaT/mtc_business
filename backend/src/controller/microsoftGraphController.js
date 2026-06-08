const User = require("../models/User");
const { verifyOAuthState } = require("../services/tokenCrypto");
const microsoftGraphCalendarService = require("../services/microsoftGraphCalendarService");

exports.getMicrosoftCalendarStatus = async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: ["id", "msGraphConnectedAt", "msGraphRefreshTokenEnc"],
    });
    return res.status(200).json({
      status: "Success",
      configured: microsoftGraphCalendarService.isConfigured(),
      connected: microsoftGraphCalendarService.userHasMicrosoftConnected(user),
      connectedAt: user?.msGraphConnectedAt || null,
    });
  } catch (error) {
    console.error("Microsoft calendar status error:", error);
    return res.status(500).json({ status: "Failed", message: "Internal server error" });
  }
};

exports.connectMicrosoftCalendar = async (req, res) => {
  try {
    if (!microsoftGraphCalendarService.isConfigured()) {
      return res.status(503).json({
        status: "Failed",
        message:
          "Microsoft calendar is not configured. Set AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, and AZURE_TENANT_ID on the server.",
      });
    }
    const url = microsoftGraphCalendarService.buildAuthorizeUrl(req.user.id);
    return res.status(200).json({ status: "Success", url });
  } catch (error) {
    console.error("Microsoft calendar connect error:", error);
    return res.status(500).json({ status: "Failed", message: "Internal server error" });
  }
};

exports.microsoftCalendarCallback = async (req, res) => {
  const frontend = process.env.FRONTEND_URL || "http://localhost:5173";
  const redirectWith = (query) => {
    res.redirect(`${frontend}/dashboard?${query}`);
  };

  try {
    const { code, state, error, error_description: errorDescription } = req.query;
    if (error) {
      return redirectWith(`microsoft=error&message=${encodeURIComponent(errorDescription || error)}`);
    }
    if (!code || !state) {
      return redirectWith("microsoft=error&message=Missing+authorization+code");
    }

    const userId = verifyOAuthState(state);
    if (!userId) {
      return redirectWith("microsoft=error&message=Invalid+or+expired+session");
    }

    const user = await User.findByPk(userId);
    if (!user) {
      return redirectWith("microsoft=error&message=User+not+found");
    }

    const tokens = await microsoftGraphCalendarService.exchangeCodeForTokens(code);
    if (!tokens.refresh_token) {
      return redirectWith("microsoft=error&message=Microsoft+did+not+return+a+refresh+token");
    }

    await microsoftGraphCalendarService.saveTokensForUser(user, tokens);
    return redirectWith("microsoft=connected");
  } catch (err) {
    console.error("Microsoft OAuth callback error:", err);
    return redirectWith(`microsoft=error&message=${encodeURIComponent(err.message || "Callback failed")}`);
  }
};

exports.disconnectMicrosoftCalendar = async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id);
    if (!user) {
      return res.status(404).json({ status: "Failed", message: "User not found" });
    }
    await user.update({
      msGraphRefreshTokenEnc: null,
      msGraphAccessTokenEnc: null,
      msGraphTokenExpiresAt: null,
      msGraphConnectedAt: null,
    });
    return res.status(200).json({ status: "Success", message: "Microsoft calendar disconnected" });
  } catch (error) {
    console.error("Microsoft disconnect error:", error);
    return res.status(500).json({ status: "Failed", message: "Internal server error" });
  }
};
