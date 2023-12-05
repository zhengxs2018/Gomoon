import { JSXElement } from 'solid-js'

export default function Card(props: { title: string; children: JSXElement; noPadding?: boolean }) {
  return (
    <div class="dark-theme overflow-hidden rounded-2xl bg-dark">
      <div class="px-4 pt-4 text-lg font-medium">{props.title}</div>
      <div class={`${props.noPadding ? 'pb-4' : 'px-4 pb-6 pt-2'}`}>{props.children}</div>
    </div>
  )
}