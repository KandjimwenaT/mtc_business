const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const Visit = sequelize.define(
  "Visit",
  {
    visitId: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      field: "visit_id",
    },
    visitNumber: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      field: "visit_number",
    },
    accountId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "account_id",
    },
    executiveId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "executive_id",
    },
    executiveName: {
      type: DataTypes.STRING,
      allowNull: false,
      field: "executive_name",
    },
    executiveEmail: {
      type: DataTypes.STRING,
      allowNull: false,
      field: "executive_email",
    },
    accountName: {
      type: DataTypes.STRING,
      allowNull: false,
      field: "account_name",
    },
    meetingType: {
      type: DataTypes.ENUM("online", "in_person"),
      allowNull: false,
      field: "meeting_type",
    },
    purpose: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    agenda: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    visitDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      field: "visit_date",
    },
    startTime: {
      type: DataTypes.STRING,
      allowNull: false,
      field: "start_time",
    },
    endTime: {
      type: DataTypes.STRING,
      allowNull: false,
      field: "end_time",
    },
    location: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    onlineLink: {
      type: DataTypes.STRING,
      allowNull: true,
      field: "online_link",
    },
    attendees: {
      type: DataTypes.TEXT,
      allowNull: true,
      get() {
        const raw = this.getDataValue("attendees");
        return raw ? JSON.parse(raw) : [];
      },
      set(val) {
        this.setDataValue("attendees", JSON.stringify(val || []));
      },
    },
    status: {
      type: DataTypes.ENUM(
        "pending",
        "approved",
        "declined",
        "confirmed",
        /** AVR submitted; customer may rate; executive still owes §6 feedback + §7 account health */
        "follow_up_pending",
        "completed",
        "cancelled",
        "rescheduled"
      ),
      allowNull: false,
      defaultValue: "pending",
    },
    customerResponse: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "customer_response",
    },
    customerRespondedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "customer_responded_at",
    },
    rescheduleDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: "reschedule_date",
    },
    rescheduleStartTime: {
      type: DataTypes.STRING,
      allowNull: true,
      field: "reschedule_start_time",
    },
    rescheduleEndTime: {
      type: DataTypes.STRING,
      allowNull: true,
      field: "reschedule_end_time",
    },
    rescheduleReason: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "reschedule_reason",
    },
    // Executive-initiated reschedule (requires manager approval)
    execRescheduleReason: {
      type: DataTypes.STRING,
      allowNull: true,
      field: "exec_reschedule_reason",
    },
    execRescheduleMotivation: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "exec_reschedule_motivation",
    },
    execRescheduleNewDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: "exec_reschedule_new_date",
    },
    execRescheduleNewTime: {
      type: DataTypes.STRING,
      allowNull: true,
      field: "exec_reschedule_new_time",
    },
    execRescheduleStatus: {
      type: DataTypes.ENUM("pending_approval", "approved", "rejected"),
      allowNull: true,
      field: "exec_reschedule_status",
    },
    managerApprovedBy: {
      type: DataTypes.STRING,
      allowNull: true,
      field: "manager_approved_by",
    },
    managerApprovedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "manager_approved_at",
    },
    // Customer rating (linked to control_cards table for the report itself)
    customerRating: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "customer_rating",
    },
    customerRatingComment: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "customer_rating_comment",
    },
    customerRatedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "customer_rated_at",
    },
    /** When the executive opened “Start visit” and GPS was captured (first write wins). */
    meetingStartedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "meeting_started_at",
    },
    startGeoLatitude: {
      type: DataTypes.DOUBLE,
      allowNull: true,
      field: "start_geo_latitude",
    },
    startGeoLongitude: {
      type: DataTypes.DOUBLE,
      allowNull: true,
      field: "start_geo_longitude",
    },
    graphEventId: {
      type: DataTypes.STRING,
      allowNull: true,
      field: "graph_event_id",
    },
    calendarSequence: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: "calendar_sequence",
    },
    calendarLastSyncedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "calendar_last_synced_at",
    },
  },
  {
    tableName: "visits",
    underscored: true,
    timestamps: true,
  }
);

module.exports = Visit;
