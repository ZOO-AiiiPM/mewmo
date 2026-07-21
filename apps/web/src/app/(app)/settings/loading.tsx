export default function SettingsLoading() {
  return (
    <main className="mewmo-account-settings-loading" aria-busy="true" aria-label="账户管理">
      <div className="mewmo-skeleton-block mewmo-account-settings-loading__heading" />
      <section className="mewmo-account-settings-loading__card">
        <div className="mewmo-skeleton-block mewmo-account-settings-loading__line" />
        <div className="mewmo-skeleton-block mewmo-account-settings-loading__identity" />
        <div className="mewmo-skeleton-block mewmo-account-settings-loading__line mewmo-account-settings-loading__line--short" />
      </section>
      <section className="mewmo-account-settings-loading__card">
        <div className="mewmo-skeleton-block mewmo-account-settings-loading__line" />
        <div className="mewmo-skeleton-block mewmo-account-settings-loading__field" />
        <div className="mewmo-skeleton-block mewmo-account-settings-loading__field" />
        <div className="mewmo-skeleton-block mewmo-account-settings-loading__button" />
      </section>
    </main>
  );
}
