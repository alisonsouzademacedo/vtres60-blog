import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/admin/login-form";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import "../admin.css";

export const metadata:Metadata={title:"Login do Admin | VTRES60 Indústria",robots:{index:false,follow:false}};

export default async function AdminLogin(){if(await isAdminAuthenticated())redirect("/admin");return <main className="admin-root admin-login"><section className="admin-login-card"><div className="admin-login-logo"><span className="admin-brand-mark">V</span><b>VTRES<span>60</span> Admin</b></div><h1>Bem-vindo de volta.</h1><p>Acesse as configurações editoriais e visuais do Portal Indústria.</p><Suspense><LoginForm/></Suspense></section></main>}
