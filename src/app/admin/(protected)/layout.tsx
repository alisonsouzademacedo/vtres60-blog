import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/admin-shell";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import "../admin.css";

export const metadata:Metadata={title:"Admin | VTRES60 Indústria",robots:{index:false,follow:false}};

export default async function ProtectedAdminLayout({children}:{children:React.ReactNode}){if(!(await isAdminAuthenticated()))redirect("/admin/login");return <AdminShell>{children}</AdminShell>}
