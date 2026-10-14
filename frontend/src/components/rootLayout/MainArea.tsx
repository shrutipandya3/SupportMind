import { Outlet } from "react-router-dom";

const MainArea = () => {
  return (
    <main className="w-full md:w-[80%] min-h-screen bg-slate-900">
      <Outlet />
    </main>
  );
};

export default MainArea