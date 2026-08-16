import React, { useState, useEffect } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Button,
} from "./ui/UIComponents";
import api from "../services/api";
import { toast } from "../utils/helpers";
import { useUser } from "../context/UserContext";

export default function ShiftTab({ mode, sessionId, currentShift, currentDate, onLogout, onCloseShiftAndLogout }) {
  const [section, setSection] = useState("L");
  const { userInitials } = useUser();

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await api.get("/settings?clerk=CLK");
        if (res.data && res.data.section) {
          setSection(res.data.section.toUpperCase());
        }
      } catch (e) {
        console.error("Failed to load settings in ShiftTab:", e);
      }
    };
    fetchSettings();
  }, []);

  const handleUpdateSection = async (sec) => {
    try {
      await api.put("/settings/section", { section: sec });
      setSection(sec);
      toast.success(`Section updated to ${sec === "L" ? "Line" : "Parcel"}`);
    } catch (e) {
      toast.error("Failed to update section");
      console.error(e);
    }
  };

  const renderSectionSetting = () => (
    <Card className="border border-zinc-800 bg-zinc-950 text-white rounded-xl shadow-lg max-w-md mx-auto overflow-hidden">
      <CardHeader className="border-b border-zinc-900 bg-zinc-950/50 pb-4">
        <CardTitle className="text-xl font-bold tracking-tight text-zinc-100 flex items-center gap-2">
          System Section
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6 space-y-4">
        <p className="text-sm text-zinc-400">
          Set section where the system is currently being used: Line (L) or Parcel (P).
        </p>
        <div className="flex gap-4">
          <Button
            variant={section === "L" ? "primary" : "outline"}
            className="flex-1 py-2 font-bold"
            onClick={() => handleUpdateSection("L")}
          >
            Line (L)
          </Button>
          <Button
            variant={section === "P" ? "primary" : "outline"}
            className="flex-1 py-2 font-bold"
            onClick={() => handleUpdateSection("P")}
          >
            Parcel (P)
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6 max-w-md mx-auto">
      <Card className="border border-zinc-800 bg-zinc-950 text-white rounded-xl shadow-lg w-full overflow-hidden">
        <CardHeader className="border-b border-zinc-900 bg-zinc-950/50 pb-4">
          <CardTitle className="text-xl font-bold tracking-tight text-zinc-100 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
            Active Shift Information
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6 space-y-6">
          <div className="space-y-4">
            <div className="flex justify-between items-center border-b border-zinc-900 pb-2">
              <span className="text-sm font-medium text-zinc-400">Clerk</span>
              <span className="text-lg font-bold text-white">{userInitials || "—"}</span>
            </div>
            <div className="flex justify-between items-center border-b border-zinc-900 pb-2">
              <span className="text-sm font-medium text-zinc-400">Business Date</span>
              <span className="text-lg font-bold text-indigo-400">{currentDate || "—"}</span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            {onLogout && (
              <Button 
                variant="outline" 
                className="flex-1 py-2 px-4 border border-zinc-800 text-zinc-300 hover:bg-zinc-900 hover:text-white transition duration-200"
                onClick={onLogout}
              >
                Logout Account
              </Button>
            )}
            {onCloseShiftAndLogout && (
              <Button
                className="flex-1 py-2 px-4 bg-red-600 hover:bg-red-700 text-white font-medium border border-transparent shadow transition duration-200"
                onClick={onCloseShiftAndLogout}
              >
                Close Shift & Log Out
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
      {renderSectionSetting()}
    </div>
  );
}
