import type { DicomInfo } from "@/lib/dicom";

// The DICOM header facts worth seeing next to a result. None of them identify the patient.
export default function DicomFacts({ info, blanked }: { info: DicomInfo; blanked?: number }) {
  const rows: [string, string | undefined][] = [
    ["Modality", info.modality],
    ["Body part", info.bodyPart],
    ["Study", info.description],
    ["Size", `${info.cols} × ${info.rows} px`],
    ["Frames", info.frames > 1 ? `${(info.frame ?? 0) + 1} of ${info.frames}` : undefined],
    ["Slice thickness", info.sliceThickness != null ? `${info.sliceThickness} mm` : undefined],
    ["Pixel spacing", info.pixelSpacing ? `${info.pixelSpacing} mm` : undefined],
    ["Window", info.window ? `centre ${info.window.center}, width ${info.window.width}` : undefined],
    ["Scanner", info.manufacturer],
  ];
  return (
    <section className="card" aria-labelledby="dicom-h">
      <h2 id="dicom-h" className="card-title">DICOM details</h2>
      <dl className="facts">
        {rows.filter(([, v]) => v).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
      </dl>
      {blanked != null && (
        <p className="fine">
          {blanked > 0
            ? `${blanked} identifying ${blanked === 1 ? "field was" : "fields were"} blanked in the copy that gets uploaded, such as the patient's name and ID.`
            : "No identifying fields were found in the header."}
        </p>
      )}
    </section>
  );
}
