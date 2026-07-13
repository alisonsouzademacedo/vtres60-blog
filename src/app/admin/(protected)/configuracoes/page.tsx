import { AdminPageHeading } from "@/components/admin/page-heading";
import { SettingsForm } from "@/components/admin/settings-form";
import { configRepository } from "@/services/config";
export default async function SettingsPage(){const settings=await configRepository.getSettings();return <><AdminPageHeading eyebrow="Geral" title="Configurações do Blog" description="Dados institucionais, contatos e navegação usados automaticamente no header e no rodapé."/><SettingsForm initial={settings}/></>}
