export type DocStatus = string;

export type Document = {
  internalId: string;
  displayId: string;
  verifyCode: string;
  name: string;
  owner?: string;
  ownerId?: string;
  ownerName?: string;
  by?: string;
  department: string;
  status: DocStatus;
  createdAt: string;
  updatedAt: string;
  hasProcessedFile: boolean;
  hasSignedFile?: boolean;
  hasOriginalFile?: boolean;
  current_role?: string;
  current_stage?: string;
  history?: any[];
  allowedActions?: string[];
  note?: string;
  enc?: boolean;
  signedBy?: string;
  signedAt?: string;
};

export type ScanLog = {
  id: string;
  _id?: string;
  internalId: string;
  documentId?: string;  // backend field name for the scanned doc's internalId
  displayId: string;
  docName?: string;
  timestamp: string;
  createdAt: string;
  at: string;
  browser?: string;
  device?: string;
  os?: string;
  isAnonymous?: boolean;
  viewerName?: string;
  viewerRole?: string;
  userAgent?: string;
  ip?: string;
};

export type Movement = {
  id: string;
  _id?: string;
  // Backend MovementLog fields
  documentId: string;      // the document's internalId
  displayId: string;
  documentName?: string;
  actionTaken?: string;    // Submitted, Received, Processing, Forwarded, Approved, Rejected, Released, Resubmission
  actorName?: string;
  actorRole?: string;
  actorDepartment?: string;
  previousStatus?: string;
  newStatus?: string;
  previousRole?: string;
  newRole?: string;
  timestamp?: string;
  displayDate?: string;
  note?: string;
  ownerId?: string;
  handledByNames?: string[];
  createdAt?: string;
  // Legacy manual movement fields (from old manual POST endpoint)
  internalId?: string;     // alias for documentId in some older data
  at?: string;             // alias for timestamp
  from?: string;           // legacy: origin office
  to?: string;             // legacy: destination office
  by?: string;             // legacy: actor
};

export type UserRole = "admin" | "staff" | "faculty" | "student" | "dean";

export type UserRow = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  online: boolean;
  lastSeen: string;
};


export type Notification = {
  id: string;
  title: string;
  body: string;
  at: string;
  read: boolean;
};

export const fullId = (d: Document) => `${d.displayId}-${d.verifyCode}`;
export const getFullDisplayId = fullId;

export function findByInternalId(documents: Document[], id: string) {
  return documents.find((d) => d.internalId === id);
}

/** Lookup a document by internalId, displayId, or full "displayId-verifyCode" string (case-insensitive). */
export function findDocument(documents: Document[], raw: string) {
  const q = raw.trim().toUpperCase();
  if (!q) return undefined;
  return documents.find(
    (d) =>
      d.internalId.toUpperCase() === q ||
      d.displayId.toUpperCase() === q ||
      `${d.displayId}-${d.verifyCode}`.toUpperCase() === q ||
      d.verifyCode.toUpperCase() === q,
  );
}

export function statusOrder(): DocStatus[] {
  return ["Received", "Processing", "For Approval", "Approved", "Released", "Rejected"];
}

export function statusCounts(documents: Document[]) {
  const order = statusOrder();
  return order.map((status) => {
    let count = 0;
    if (status === "For Approval") {
      count = documents.filter((d) => d.status === "For Approval" || d.status === "Under Evaluation").length;
    } else if (status === "Released") {
      count = documents.filter((d) => d.status === "Released" || d.status === "Approved and Released").length;
    } else {
      count = documents.filter((d) => d.status === status).length;
    }
    return { status, count };
  });
}

/** Registrations per day for the last `days` days (inclusive of today). */
export function registrationsTrend(documents: Document[], days = 14) {
  const buckets: { date: string; label: string; count: number }[] = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(today.getDate() - i);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const key = `${year}-${month}-${day}`;
    
    buckets.push({
      date: key,
      label: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      count: 0,
    });
  }
  for (const doc of documents) {
    const rawDate = doc.createdAt || (doc as any).date || (doc as any).dateFiled;
    if (!rawDate) continue;
    const docDate = new Date(rawDate);
    const year = docDate.getFullYear();
    const month = String(docDate.getMonth() + 1).padStart(2, "0");
    const day = String(docDate.getDate()).padStart(2, "0");
    const key = `${year}-${month}-${day}`;
    
    const b = buckets.find((x) => x.date === key);
    if (b) b.count += 1;
  }
  return buckets;
}

/** Document volume grouped by department, sorted desc. */
export function departmentCounts(documents: Document[]) {
  const map = new Map<string, number>();
  for (const d of documents) {
    if(d.department) {
      map.set(d.department, (map.get(d.department) ?? 0) + 1);
    }
  }
  return Array.from(map, ([department, count]) => ({ department, count })).sort(
    (a, b) => b.count - a.count,
  );
}
