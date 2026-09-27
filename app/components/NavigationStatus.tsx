import { useNavigation } from "react-router";

export function NavigationStatus() {
  const navigation = useNavigation();
  const busy = navigation.state !== "idle";
  return (
    <div className={`navigation-status${busy ? " is-busy" : ""}`} aria-hidden={!busy}>
      <span />
      <span className="sr-only" role="status" aria-live="polite">{busy ? "Loading page" : ""}</span>
    </div>
  );
}
