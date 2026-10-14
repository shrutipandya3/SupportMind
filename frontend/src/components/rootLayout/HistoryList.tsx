import { Link, useParams } from "react-router-dom";
import { MessageSquare } from "lucide-react";
import { useChats } from "@/hooks/useChats";
import { cn } from "cn";

const HistoryList = () => {
  const { id: activeChatId } = useParams<{ id: string }>();
  const { data: chats, isLoading, isError } = useChats();

  if (isLoading) {
    return (
      <div className="flex flex-col gap-1 px-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="h-7 rounded-md bg-sidebar-accent/50 animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <p className="px-1 text-xs text-destructive/80">
        Failed to load history.
      </p>
    );
  }

  if (!chats || chats.length === 0) {
    return (
      <p className="px-1 text-xs text-muted-foreground">No conversations yet.</p>
    );
  }

  return (
    <nav aria-label="Chat history">
      <p className="mb-1.5 px-1 text-[0.65rem] font-semibold uppercase tracking-widest text-muted-foreground/70 select-none">
        Recent
      </p>
      <ul className="flex flex-col gap-0.5">
        {chats.map((chat) => {
          const isActive = chat.id === activeChatId;
          return (
            <li key={chat.id} className="group relative list-none">
              {/* Tooltip */}
              <span
                role="tooltip"
                className={cn(
                  "pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2",
                  "rounded-md bg-foreground/90 px-2.5 py-1 text-xs text-background shadow-md",
                  "whitespace-nowrap opacity-0 scale-95 transition-all duration-150",
                  "group-hover:opacity-100 group-hover:scale-100"
                )}
              >
                {chat.title}
              </span>

              <Link
                to={`/chat/${chat.id}`}
                title={chat.title}
                className={cn(
                  // Base
                  "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                  // Inactive
                  "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  // Active
                  isActive &&
                    "bg-sidebar-primary text-sidebar-primary-foreground font-medium hover:bg-sidebar-primary"
                )}
              >
                {/* Bullet / icon */}
                <MessageSquare
                  className={cn(
                    "size-3.5 shrink-0",
                    isActive
                      ? "text-sidebar-primary-foreground"
                      : "text-muted-foreground group-hover:text-sidebar-accent-foreground"
                  )}
                />

                {/* Title — truncated */}
                <span className="min-w-0 flex-1 truncate">{chat.title}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};

export default HistoryList;
