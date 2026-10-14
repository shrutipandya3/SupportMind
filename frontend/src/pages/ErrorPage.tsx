import { useState } from "react";
import {
  isRouteErrorResponse,
  useNavigate,
  useRouteError,
} from "react-router";
import { AlertTriangle, Check, Copy, Home, RotateCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type ErrorInfo = {
  status?: number;
  title: string;
  message: string;
  details?: string;
};

function parseError(error: unknown): ErrorInfo {
  if (isRouteErrorResponse(error)) {
    if (error.status === 404) {
      return {
        status: 404,
        title: "Page not found",
        message: "The page you're looking for doesn't exist or has moved.",
      };
    }
    return {
      status: error.status,
      title: error.statusText || "Request failed",
      message:
        typeof error.data === "string"
          ? error.data
          : "The server couldn't complete this request.",
    };
  }

  if (error instanceof Error) {
    return {
      title: "Something went wrong",
      message: error.message,
      details: error.stack,
    };
  }

  return {
    title: "Something went wrong",
    message: "An unexpected error occurred.",
    details: typeof error === "string" ? error : JSON.stringify(error, null, 2),
  };
}

export default function ErrorPage() {
  const error = useRouteError();
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);

  const { status, title, message, details } = parseError(error);
  const showDetails = import.meta.env.DEV && !!details;

  const copyDetails = async () => {
    if (!details) return;
    await navigator.clipboard.writeText(`${message}\n\n${details}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <main className="flex min-h-svh items-center justify-center bg-background p-4">
      <Card className="w-full max-w-lg border-border shadow-sm">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex size-14 items-center justify-center rounded-full bg-secondary text-primary ring-8 ring-accent/40">
            <AlertTriangle className="size-7" aria-hidden="true" />
          </div>

          {status && (
            <p className="text-6xl font-semibold tracking-tight text-primary">
              {status}
            </p>
          )}

          <CardTitle className="text-xl">{title}</CardTitle>
          <CardDescription className="max-w-sm text-balance break-words">
            {message}
          </CardDescription>
        </CardHeader>

        {showDetails && (
          <CardContent>
            <div className="rounded-lg border border-border bg-muted">
              <div className="flex items-center justify-between border-b border-border px-3 py-2">
                <span className="text-sm font-medium text-muted-foreground">
                  Stack trace
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={copyDetails}
                  className="h-7 gap-1.5 text-muted-foreground"
                >
                  {copied ? (
                    <Check className="size-3.5" />
                  ) : (
                    <Copy className="size-3.5" />
                  )}
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
              <pre className="max-h-48 overflow-auto p-3 text-xs leading-relaxed text-muted-foreground">
                {details}
              </pre>
            </div>
          </CardContent>
        )}

        <CardFooter className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button
            className="w-full sm:w-auto"
            onClick={() => window.location.reload()}
          >
            <RotateCw className="size-4" />
            Reload page
          </Button>
          <Button
            variant="outline"
            className="w-full sm:w-auto"
            onClick={() => navigate("/", { replace: true })}
          >
            <Home className="size-4" />
            Go to home
          </Button>
        </CardFooter>
      </Card>
    </main>
  );
}