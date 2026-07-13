import { NextResponse } from "next/server";
export const apiError=(error:unknown,status=400)=>NextResponse.json({error:error instanceof Error?error.message:"Não foi possível concluir a operação."},{status});
export const required=(body:unknown,fields:string[])=>{if(!body||typeof body!=="object")return false;const record=body as Record<string,unknown>;return fields.every((field)=>typeof record[field]==="string"&&Boolean((record[field] as string).trim()))};
