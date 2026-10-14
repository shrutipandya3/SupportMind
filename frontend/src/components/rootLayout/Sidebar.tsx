import { useNavigate } from "react-router-dom";
import { Plus, BotMessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import HistoryList from "@/components/rootLayout/HistoryList";

const Sidebar = () => {
  const navigate = useNavigate();

  return (
    <aside className="w-full md:w-[20%] min-h-48 md:min-h-screen bg-sidebar text-sidebar-foreground border-b md:border-b-0 md:border-r border-sidebar-border p-4 flex flex-col gap-6">
      {/* App Branding */}
      <div className="flex items-center gap-2.5 px-1 pt-1">
        <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-xs">
          <BotMessageSquare className="size-5" />
        </div>
        <div className="flex flex-col">
          <span className="text-base font-semibold tracking-tight text-sidebar-foreground">
            SupportMind
          </span>
          <span className="text-xs text-muted-foreground font-normal">
            AI Assistant
          </span>
        </div>
      </div>

      {/* New Chat Action */}
      <div>
        <Button
          onClick={() => navigate("/")}
          className="w-full justify-start gap-2 shadow-xs cursor-pointer font-medium"
        >
          <Plus className="size-4" />
          <span>New Chat</span>
        </Button>
      </div>

      {/* Chat History */}
      <div className="flex-1 overflow-y-auto">
        <HistoryList />
      </div>
    </aside>
  );
};

export default Sidebar;
