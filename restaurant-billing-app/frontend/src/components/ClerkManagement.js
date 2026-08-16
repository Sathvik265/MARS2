import React, { useState, useEffect } from "react";
import api from "../services/api";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Input,
  Button,
  Loader2,
  Label,
} from "./ui/UIComponents";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "./ui/Table";
import { toast, safeGet, safeArray } from "../utils/helpers";

export default function ClerkManagement() {
  const [clerks, setClerks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [newClerkInitials, setNewClerkInitials] = useState("");
  const [creating, setCreating] = useState(false);

  const loadClerks = async () => {
    setLoading(true);
    try {
      const res = await api.get("/settings/clerks");
      setClerks(safeArray(res.data));
    } catch (e) {
      console.error("Failed to load clerks:", e);
      toast.error("Failed to load clerks");
      setClerks([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadClerks();
  }, []);

  const createClerk = async () => {
    const initials = newClerkInitials.trim().toUpperCase();

    if (!initials) {
      toast.error("Please enter clerk initials");
      return;
    }

    if (initials.length > 10) {
      toast.error("Clerk initials must be 10 characters or less");
      return;
    }

    if (clerks.some((c) => c.clerk_initials === initials)) {
      toast.error("Clerk with these initials already exists");
      return;
    }

    setCreating(true);
    try {
      // Create settings entry for the new clerk using the POST endpoint
      await api.post("/settings/clerk", { clerk: initials });

      toast.success(`Clerk ${initials} created successfully`);
      setNewClerkInitials("");
      loadClerks();
    } catch (e) {
      console.error("Failed to create clerk:", e);
      toast.error(safeGet(e, "response.data.detail", "Failed to create clerk"));
    } finally {
      setCreating(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Clerk Management</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Create New Clerk */}
          <div className="p-4 border rounded-lg bg-gray-50">
            <h3 className="font-semibold mb-3">Create New Clerk</h3>
            <div className="flex gap-2">
              <div className="flex-1">
                <Label>Clerk Initials (max 10 characters)</Label>
                <Input
                  value={newClerkInitials}
                  onChange={(e) =>
                    setNewClerkInitials(e.target.value.toUpperCase())
                  }
                  maxLength={10}
                  placeholder="e.g., HARISH"
                  className="mt-1"
                />
              </div>
              <div className="flex items-end">
                <Button
                  onClick={createClerk}
                  disabled={creating || !newClerkInitials.trim()}
                >
                  {creating ? (
                    <>
                      <Loader2 size={16} className="mr-2" />
                      Creating...
                    </>
                  ) : (
                    "Create Clerk"
                  )}
                </Button>
              </div>
            </div>
            <p className="text-sm text-gray-600 mt-2">
              New clerks will be created with default settings copied from CLK.
              You can edit their settings after creation.
            </p>
          </div>

          {/* Existing Clerks List */}
          <div>
            <h3 className="font-semibold mb-3">Existing Clerks</h3>
            {loading ? (
              <div className="text-center py-8">
                <Loader2 size={24} className="mb-2" />
                <p>Loading clerks...</p>
              </div>
            ) : clerks.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Clerk Initials</TableHead>
                    <TableHead>Hotel Name</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clerks.map((clerk) => (
                    <TableRow key={clerk.clerk_initials}>
                      <TableCell className="font-mono font-bold">
                        {clerk.clerk_initials}
                      </TableCell>
                      <TableCell>{clerk.hotel_name || "Not set"}</TableCell>
                      <TableCell>
                        <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs">
                          Active
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-8 text-gray-500">
                No clerks found
              </div>
            )}
          </div>

          <div className="text-sm text-gray-600 p-3 bg-blue-50 rounded border border-blue-200">
            <strong>Note:</strong> Only clerks listed here can login to the
            system. To edit a clerk's settings, use the "Settings for Clerk"
            selector above.
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
