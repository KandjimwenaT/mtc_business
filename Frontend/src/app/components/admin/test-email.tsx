import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Mail, Loader2 } from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from "../ui-components";
import { sendTestEmail, type TestEmailResponse } from "../../api/adminApi";

export default function TestEmailPage() {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("MTC Business — test email");
  const [message, setMessage] = useState(
    "This is a test email from the MTC Business portal. If you received this, SMTP accepted the message."
  );
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<TestEmailResponse | null>(null);

  const handleSend = async (e: FormEvent) => {
    e.preventDefault();
    const recipient = to.trim();
    if (!recipient) {
      toast.error("Enter a recipient email");
      return;
    }
    setSending(true);
    setResult(null);
    try {
      const response = await sendTestEmail({
        to: recipient,
        subject: subject.trim() || undefined,
        message: message.trim() || undefined,
      });
      setResult(response);
      console.log("Test email response:", response);
      if (response.emailSent) {
        toast.success("SMTP accepted the message", {
          description: `Check inbox and junk for ${recipient}. Corporate mail may still drop it after Gmail accepts.`,
        });
      } else {
        toast.error("SMTP did not accept the message", {
          description: response.message,
        });
      }
    } catch (err: unknown) {
      const error = err as Error & { emailDelivery?: TestEmailResponse["emailDelivery"] };
      const failed: TestEmailResponse = {
        status: "Failed",
        message: error.message,
        emailSent: false,
        emailDelivery: error.emailDelivery ?? { success: false, error: error.message },
      };
      setResult(failed);
      console.log("Test email error:", failed);
      toast.error("Failed to send test email", { description: error.message });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">Test email</h2>
        <p className="text-sm text-slate-500 mt-1">
          Sends a message through the same Gmail SMTP path used for onboarding credentials.
          Gmail accepting the mail does not guarantee delivery to @mtc.com.na.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-mtc-blue" />
            Send test
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSend} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="test-email-to">To</Label>
              <Input
                id="test-email-to"
                type="email"
                placeholder="name@mtc.com.na or name@gmail.com"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="test-email-subject">Subject</Label>
              <Input
                id="test-email-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="test-email-message">Message</Label>
              <textarea
                id="test-email-message"
                rows={5}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="flex w-full rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-mtc-blue disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
            <Button type="submit" disabled={sending}>
              {sending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending…
                </>
              ) : (
                "Send test email"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle>SMTP response</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm mb-3">
              {result.emailSent ? (
                <span className="text-green-700 font-medium">{result.message}</span>
              ) : (
                <span className="text-red-700 font-medium">{result.message}</span>
              )}
            </p>
            <pre className="text-xs bg-slate-50 border border-slate-200 rounded-md p-3 overflow-auto max-h-80">
              {JSON.stringify(result.emailDelivery, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
