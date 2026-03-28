import { Link } from "react-router";
import { Button } from "./ui-components";
import { Home, ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center animate-in fade-in duration-500">
      <div className="text-7xl font-bold text-slate-200 mb-4">404</div>
      <h2 className="text-2xl font-bold text-slate-900 mb-2">Page Not Found</h2>
      <p className="text-slate-500 mb-8 max-w-md">
        The page you're looking for doesn't exist or has been moved. 
        Please check the URL or return to the login page.
      </p>
      <div className="flex gap-3">
        <Link to="/">
          <Button className="flex items-center gap-2">
            <Home className="h-4 w-4" /> Go to Login
          </Button>
        </Link>
      </div>
    </div>
  );
}
