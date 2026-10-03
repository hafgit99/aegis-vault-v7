/**
 * @file LegalRichText.tsx
 * @description Renders the website's legal copy inside the app.
 *
 * The privacy policy and terms of use carry <strong>, <code> and mailto <a>.
 * Those markups are meaningful -- the <strong> in the privacy policy is the
 * sentence promising that vault data is never collected, and the one in the
 * terms is the sentence stating that no recovery mechanism exists -- so
 * stripping the tags would quietly remove the most important claims in the
 * document.
 *
 * Injecting the string as raw HTML would keep them, and is the one thing this
 * file must not do: the values come from a translation table, so every locale
 * file would become a script vector, and the CSP gate
 * (scripts/security-csp-no-unsafe-inline.cjs) exists precisely to keep that
 * pattern out of the codebase.
 *
 * So the inline markup is parsed into React elements from a fixed grammar.
 * Only <strong>, <em>, <code> and mailto links are recognised; everything else
 * is rendered as literal text, so an unexpected tag cannot become an element and
 * a translation string cannot inject markup.
 *
 * @license SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

type Segment =
  | { kind: 'text'; value: string }
  /* A parsed run of inline markup. `value` is already React nodes, so it is not
   * re-parsed: a <strong> nested inside a <strong> keeps its own element rather
   * than being flattened by a second pass. */
  | { kind: 'inline'; value: React.ReactNode[] }
  | { kind: 'link'; value: React.ReactNode[]; href: string };

/* These are built fresh inside each parser call rather than shared as module
 * constants. parseInline recurses, and a shared /g regex carries `lastIndex`
 * between calls: the nested call resets it to 0, so the outer exec loop restarts
 * from the beginning of the string and never terminates. That showed up as a
 * vitest heap exhaustion rather than a wrong value, which is a miserable way to
 * find this, hence the note. */
function inlinePattern(): RegExp {
  return /<(strong|em|code)>([\s\S]*?)<\/\1>/gi;
}

function linkPattern(): RegExp {
  return /<a\s+href="mailto:([^"]+)"\s*>([\s\S]*?)<\/a>/gi;
}

/* The DOMAIN token is what the deploy check looks for; inside the app there is
 * no domain to substitute, so it is dropped rather than shown to the reader. */
function stripDeployToken(value: string): string {
  return value.replace(/\{\{DOMAIN\}\}/g, '');
}

function parseSegments(source: string): Segment[] {
  const segments: Segment[] = [];
  let cursor = 0;
  let plain = '';

  const flushPlain = () => {
    if (plain) {
      segments.push({ kind: 'text', value: plain });
      plain = '';
    }
  };

  const linkRe = linkPattern();
  let link: RegExpExecArray | null;
  while ((link = linkRe.exec(source)) !== null) {
    plain += source.slice(cursor, link.index);
    flushPlain();

    const href = stripDeployToken(link[1] ?? '').trim();
    // href="mailto:" alone, or a bare domain with no local part, is not a
    // reachable address and is not worth rendering as a link.
    const address = /^[^@\s]+@[^@\s]+$/.test(href) ? href : '';

    if (address) {
      segments.push({ kind: 'link', value: parseInline(link[2] ?? ''), href: address });
    } else {
      segments.push({ kind: 'text', value: stripDeployToken(link[2] ?? '') });
    }

    cursor = link.index + link[0].length;
  }

  plain += source.slice(cursor);
  flushPlain();

  // Plain text can still carry <strong>, <em> and <code>, so it is parsed as
  // markup rather than pushed through verbatim. parseSegments only walks links;
  // everything else is handled here, and both paths share parseInline so a
  // strong inside a link and a strong outside one are rendered the same way.
  return segments.flatMap((segment) =>
    segment.kind === 'text'
      ? parseInline(segment.value).map((node) => ({ kind: 'inline', value: [node] }) as Segment)
      : [segment]
  );
}

function parseInline(source: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  let plain = '';

  const flushPlain = () => {
    if (plain) {
      nodes.push(stripDeployToken(plain));
      plain = '';
    }
  };

  const inlineRe = inlinePattern();
  let tag: RegExpExecArray | null;
  while ((tag = inlineRe.exec(source)) !== null) {
    plain += source.slice(cursor, tag.index);
    flushPlain();

    const name = tag[1] as 'strong' | 'em' | 'code';
    const inner = parseInline(tag[2] ?? '');
    nodes.push(
      name === 'strong' ? <strong key={`s${tag.index}`}>{inner}</strong>
        : name === 'em' ? <em key={`e${tag.index}`}>{inner}</em>
          : <code key={`c${tag.index}`} className="font-mono text-[0.95em]">{inner}</code>
    );

    cursor = tag.index + tag[0].length;
  }

  plain += source.slice(cursor);
  flushPlain();
  return nodes;
}

export interface LegalRichTextProps {
  /** The raw translation value, inline markup included. */
  children: string;
  className?: string;
}

export function LegalRichText({ children, className }: LegalRichTextProps) {
  const segments = parseSegments(children);
  return (
    <span className={className}>
      {segments.map((segment, index) => {
        if (segment.kind === 'link') {
          return (
            <a
              key={index}
              href={`mailto:${segment.href}`}
              className="text-brand-primary hover:underline underline-offset-2 break-words"
            >
              {segment.value}
            </a>
          );
        }
        return <React.Fragment key={index}>{segment.value}</React.Fragment>;
      })}
    </span>
  );
}

export default LegalRichText;