import { LivePhoneNumberSettingsSurface } from "@/components/live-phone-number-settings-surface";
import { isPilotMode } from "@lobbystack/shared";

export default function PhoneNumberPage() { return <LivePhoneNumberSettingsSurface pilotMode={isPilotMode(process.env)} />; }
