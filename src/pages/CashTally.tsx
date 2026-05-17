import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useBills } from "@/hooks/useDatabase";
import { CalendarDays, IndianRupee, Receipt } from "lucide-react";
import { useState } from "react";

const toLocalDateInput = (date: Date) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};

const getMonthStart = (date: Date) =>
  toLocalDateInput(new Date(date.getFullYear(), date.getMonth(), 1));
const getMonthEnd = (date: Date) =>
  toLocalDateInput(new Date(date.getFullYear(), date.getMonth() + 1, 0));
const billDate = (createdAt: string) => toLocalDateInput(new Date(createdAt));

export default function CashTally() {
  const { data: bills, isLoading } = useBills();
  const [rangeMode, setRangeMode] = useState("month");
  const [fromDate, setFromDate] = useState(getMonthStart(new Date()));
  const [toDate, setToDate] = useState(getMonthEnd(new Date()));

  const applyRangeMode = (mode: string) => {
    const today = new Date();
    setRangeMode(mode);
    if (mode === "today") {
      const iso = toLocalDateInput(today);
      setFromDate(iso);
      setToDate(iso);
    }
    if (mode === "month") {
      setFromDate(getMonthStart(today));
      setToDate(getMonthEnd(today));
    }
  };

  const filteredBills = (bills || []).filter((bill) => {
    const date = billDate(bill.created_at);
    return date >= fromDate && date <= toDate;
  });

  const tally = filteredBills.reduce(
    (acc, bill) => {
      const amount = Number(bill.amount || 0);
      const paid = Number((bill as any).amount_paid || 0);
      acc.total += amount;
      acc.received += paid;
      acc.pending += Math.max(amount - paid, 0);
      return acc;
    },
    { total: 0, received: 0, pending: 0 },
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="module-header">Cash Tally</h1>
          <p className="text-sm text-muted-foreground">
            Date select karke total aaya aur baki amount check kare
          </p>
        </div>

        <Card className="border-primary/20">
          <CardHeader className="pb-3">
            <CardTitle className="font-heading text-base flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-primary" /> Date Range
            </CardTitle>
          </CardHeader>
          <CardContent className="grid md:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Filter</Label>
              <Select value={rangeMode} onValueChange={applyRangeMode}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">Aaj ki date</SelectItem>
                  <SelectItem value="month">Is month</SelectItem>
                  <SelectItem value="custom">Custom date</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">From Date</Label>
              <Input
                type="date"
                value={fromDate}
                onChange={(e) => {
                  setRangeMode("custom");
                  setFromDate(e.target.value);
                }}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">To Date</Label>
              <Input
                type="date"
                value={toDate}
                onChange={(e) => {
                  setRangeMode("custom");
                  setToDate(e.target.value);
                }}
              />
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Bills</p>
              <p className="text-2xl font-bold text-primary">{filteredBills.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="text-2xl font-bold">₹{tally.total.toLocaleString()}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Aaya / Paid</p>
              <p className="text-2xl font-bold text-success">₹{tally.received.toLocaleString()}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Baki / Due</p>
              <p className="text-2xl font-bold text-warning">₹{tally.pending.toLocaleString()}</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-base flex items-center gap-2">
              <Receipt className="h-4 w-4 text-primary" /> Bills Detail
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs text-muted-foreground">
                      <th className="text-left py-2">Date</th>
                      <th className="text-left py-2">Patient</th>
                      <th className="text-right py-2">Total</th>
                      <th className="text-right py-2">Paid</th>
                      <th className="text-right py-2">Due</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredBills.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-6 text-center text-muted-foreground">
                          Selected date range me koi bill nahi hai
                        </td>
                      </tr>
                    )}
                    {filteredBills.map((bill) => {
                      const paid = Number((bill as any).amount_paid || 0);
                      const due = Math.max(Number(bill.amount || 0) - paid, 0);
                      return (
                        <tr key={bill.id} className="border-b">
                          <td className="py-2">
                            {new Date(bill.created_at).toLocaleDateString("en-IN")}
                          </td>
                          <td className="py-2 font-medium">{(bill.patients as any)?.name}</td>
                          <td className="py-2 text-right">
                            ₹{Number(bill.amount).toLocaleString()}
                          </td>
                          <td className="py-2 text-right text-success">₹{paid.toLocaleString()}</td>
                          <td className="py-2 text-right text-warning">₹{due.toLocaleString()}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
