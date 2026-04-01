export function PlaceholderSection(props: { title: string; description: string }) {
  return (
    <section className="rounded-[28px] border border-white/10 bg-white/5 p-6">
      <h3 className="text-2xl font-semibold text-white">{props.title}</h3>
      <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300">
        {props.description}
      </p>
      <div className="mt-6 rounded-2xl border border-dashed border-white/15 bg-slate-900/70 px-5 py-8 text-sm leading-6 text-slate-400">
        Modulis ir ieplānots un tiks ieviests nākamajos soļos virsū jau gatavajam
        autentifikācijas un profila karkasam.
      </div>
    </section>
  )
}
