"use client";
import { Save } from "lucide-react";
import type { SaveState } from "./use-config-editor";
export function SaveBar({state,message,onSave}:{state:SaveState;message:string;onSave:()=>void}){return <div className="admin-savebar"><span data-state={state}>{message}</span><button className="admin-primary-button" type="button" onClick={onSave} disabled={state==="saving"}><Save size={14}/>{state==="saving"?"Salvando...":"Salvar alterações"}</button></div>}
