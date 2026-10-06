import PptxGenJS from "pptxgenjs";
import { Document, Packer, Paragraph, HeadingLevel, TextRun, AlignmentType } from "docx";

export interface SlideSpec {
  title: string;
  bullets: string[];
  code?: string;
  notes?: string;
}

export interface DeckSpec {
  title: string;
  subtitle: string;
  slides: SlideSpec[];
}

const TEAL = "0F766E";
const INK = "0F172A";
const MUTED = "475569";
const FONT = "Arial";

/** AI bergan slayd tuzilmasidan .pptx fayl yig'adi */
export async function buildPptx(deck: DeckSpec): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE"; // 13.33 x 7.5 dyuym
  pptx.title = deck.title;
  pptx.company = "ITXiva";

  pptx.defineSlideMaster({
    title: "CONTENT",
    background: { color: "FFFFFF" },
    objects: [
      { rect: { x: 0, y: 0, w: 0.18, h: 7.5, fill: { color: TEAL } } },
      { text: { text: "ITXiva", options: { x: 11.4, y: 6.95, w: 1.6, h: 0.35, fontFace: FONT, fontSize: 11, color: MUTED, align: "right" } } },
    ],
    slideNumber: { x: 0.45, y: 6.95, fontFace: FONT, fontSize: 11, color: MUTED },
  });

  const cover = pptx.addSlide();
  cover.background = { color: TEAL };
  cover.addText(deck.title, { x: 0.9, y: 2.3, w: 11.5, h: 1.7, fontFace: FONT, fontSize: 44, bold: true, color: "FFFFFF", fit: "shrink" });
  cover.addText(deck.subtitle, { x: 0.9, y: 4.1, w: 11.5, h: 0.9, fontFace: FONT, fontSize: 22, color: "CCFBF1" });
  cover.addText("ITXiva · Muhammad al-Xorazmiy vorislari", { x: 0.9, y: 6.5, w: 11.5, h: 0.4, fontFace: FONT, fontSize: 13, color: "CCFBF1" });

  for (const spec of deck.slides) {
    const slide = pptx.addSlide({ masterName: "CONTENT" });
    slide.addText(spec.title, { x: 0.6, y: 0.4, w: 12.1, h: 0.9, fontFace: FONT, fontSize: 30, bold: true, color: INK, fit: "shrink" });

    const hasCode = Boolean(spec.code?.trim());
    const bulletWidth = hasCode ? 5.9 : 12.1;
    if (spec.bullets.length > 0) {
      slide.addText(
        spec.bullets.map((text) => ({ text, options: { bullet: { indent: 18 }, breakLine: true, paraSpaceAfter: 10 } })),
        { x: 0.6, y: 1.5, w: bulletWidth, h: 5.2, fontFace: FONT, fontSize: 20, color: INK, valign: "top", fit: "shrink" }
      );
    }
    if (hasCode) {
      slide.addText(spec.code!.trim(), {
        x: 6.8, y: 1.5, w: 5.9, h: 5.2,
        fontFace: "Consolas", fontSize: 14, color: "E2E8F0", fill: { color: INK },
        valign: "top", margin: 14, fit: "shrink",
      });
    }
    if (spec.notes) slide.addNotes(spec.notes);
  }

  return (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
}

export interface HandoutSpec {
  title: string;
  intro: string;
  sections: { heading: string; paragraphs: string[]; code?: string }[];
  exercises: string[];
  homework: string[];
}

/** AI bergan tuzilmadan o'quvchilar uchun konspekt (.docx) yig'adi */
export async function buildDocx(handout: HandoutSpec): Promise<Buffer> {
  const body = (text: string) =>
    new Paragraph({ spacing: { after: 140 }, children: [new TextRun({ text, size: 24, font: FONT })] });
  const numbered = (items: string[]) =>
    items.map(
      (text, i) =>
        new Paragraph({ spacing: { after: 100 }, indent: { left: 360 }, children: [new TextRun({ text: `${i + 1}. ${text}`, size: 24, font: FONT })] })
    );
  const heading = (text: string) =>
    new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 280, after: 140 }, children: [new TextRun({ text, bold: true, size: 30, font: FONT, color: TEAL })] });

  const children: Paragraph[] = [
    new Paragraph({ heading: HeadingLevel.TITLE, alignment: AlignmentType.LEFT, spacing: { after: 200 }, children: [new TextRun({ text: handout.title, bold: true, size: 44, font: FONT })] }),
    body(handout.intro),
  ];

  for (const section of handout.sections) {
    children.push(heading(section.heading), ...section.paragraphs.map(body));
    if (section.code?.trim()) {
      for (const line of section.code.trim().split("\n")) {
        children.push(
          new Paragraph({ shading: { fill: "F1F5F9" }, indent: { left: 240 }, children: [new TextRun({ text: line || " ", font: "Consolas", size: 20 })] })
        );
      }
      children.push(new Paragraph({ spacing: { after: 140 }, children: [] }));
    }
  }
  if (handout.exercises.length > 0) children.push(heading("Mashqlar"), ...numbered(handout.exercises));
  if (handout.homework.length > 0) children.push(heading("Uy vazifasi"), ...numbered(handout.homework));

  const doc = new Document({ creator: "ITXiva", title: handout.title, sections: [{ children }] });
  return Packer.toBuffer(doc);
}
