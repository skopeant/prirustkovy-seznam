import { Component } from '@angular/core';
import { CloudAppRestService, CloudAppConfigService } from '@exlibris/exl-cloudapp-angular-lib';
import { firstValueFrom } from 'rxjs';

import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

interface AnalyticsSeed {
  mmsId: string;
  inventoryNumber: string;
}

interface BibRecord {
  mmsId: string;
  title: string;
  author: string;
  extent: string;
  isbn: string;
  issn: string;
  isSerial: boolean;
}

interface InventoryItem {
  inventoryNumber: string;
  callNumber: string;
  location: string;
  mmsId: string;

  title: string;
  author: string;
  extent: string;
  isbn: string;
  issn: string;
  isSerial: boolean;

  description: string;
  materialType: string;

  inventoryDate: string;
  inventoryPrice: string;
  internalNote2: string;

  poLine: string;
  acquisitionMethod: string;
  vendor: string;
  invoiceNumber: string;

  barcode: string;
}

@Component({
  selector: 'app-main',
  templateUrl: './main.component.html',
  styleUrls: ['./main.component.scss']
})
export class MainComponent {

  inventoryFrom = '';
  inventoryTo = '';

  loading = false;
  creatingPdf = false;

  errorMessage = '';
  resultMessage = '';
  progressMessage = '';

  warnings: string[] = [];
  items: InventoryItem[] = [];

  pdfUrl = '';
  pdfFilename = '';

  // Institucionální konfigurace. Ukládá se v Alma CloudAppConfigService,
  // není tedy součástí zdrojového kódu a každá instituce si nastaví vlastní hodnoty.
  analyticsReportPath = '';
  institutionName = '';
  configurationLoaded = false;
  configurationSaving = false;
  configurationMessage = '';
  configurationError = '';

  constructor(
    private restService: CloudAppRestService,
    private configService: CloudAppConfigService
  ) {
  }

  ngOnInit(): void {
    this.configService.get().subscribe({
      next: (config: any) => {
        this.analyticsReportPath = String(config?.analyticsReportPath || '').trim();
        this.institutionName = String(config?.institutionName || '').trim();
        this.configurationLoaded = true;
      },
      error: (error: any) => {
        console.error('Configuration load error:', error);
        this.configurationLoaded = true;
        this.configurationError = 'Nepodařilo se načíst konfiguraci aplikace.';
      }
    });
  }

  get configMode(): boolean {
    return window.location.hash.toLowerCase().includes('/config');
  }

  get isConfigured(): boolean {
    return !!this.analyticsReportPath.trim();
  }

  async saveConfiguration(): Promise<void> {
    this.configurationMessage = '';
    this.configurationError = '';

    const analyticsReportPath = this.analyticsReportPath.trim();
    const institutionName = this.institutionName.trim();

    if (!analyticsReportPath) {
      this.configurationError = 'Vyplňte cestu k Analytics reportu.';
      return;
    }

    if (!analyticsReportPath.startsWith('/shared/')) {
      this.configurationError = 'Cesta k Analytics reportu musí začínat /shared/.';
      return;
    }

    this.configurationSaving = true;

    try {
      await firstValueFrom(
        this.configService.set({
          analyticsReportPath,
          institutionName
        })
      );
      this.analyticsReportPath = analyticsReportPath;
      this.institutionName = institutionName;
      this.configurationMessage = 'Nastavení bylo uloženo pro celou instituci.';
    } catch (e: any) {
      console.error('Configuration save error:', e);
      this.configurationError =
        e?.message || 'Nastavení se nepodařilo uložit.';
    } finally {
      this.configurationSaving = false;
    }
  }

  goToMain(): void {
    window.location.hash = '';
  }

  async loadRange(): Promise<void> {
    this.errorMessage = '';
    this.resultMessage = '';
    this.progressMessage = '';
    this.warnings = [];
    this.clearPdfLink();
    this.items = [];

    const from = this.inventoryFrom.trim();
    const to = this.inventoryTo.trim();

    if (!this.configurationLoaded) {
      this.errorMessage = 'Konfigurace aplikace se ještě načítá. Zkuste to za okamžik znovu.';
      return;
    }

    if (!this.isConfigured) {
      this.errorMessage =
        'Aplikace není nakonfigurována. Správce instituce musí v konfiguraci nastavit cestu k Analytics reportu.';
      return;
    }

    const validation = this.validateRange(from, to);

    if (!validation.ok) {
      this.errorMessage = validation.message;
      return;
    }

    this.loading = true;

    try {
      this.progressMessage = 'Vyhledávám rozsah v Alma Analytics…';

      const seeds = await this.loadAnalyticsSeeds(from, to);

      if (seeds.length === 0) {
        this.progressMessage = '';
        this.resultMessage = 'V zadaném rozsahu nebyly nalezeny žádné jednotky.';
        return;
      }

      const bibCache = new Map<string, BibRecord>();
      const itemResponseCache = new Map<string, any>();

      for (let i = 0; i < seeds.length; i++) {
        const seed = seeds[i];

        this.progressMessage =
          `Načítám bibliografické a jednotkové údaje ${i + 1} / ${seeds.length}…`;

        let bib = bibCache.get(seed.mmsId);
        if (!bib) {
          try {
            bib = await this.loadBibRecord(seed.mmsId);
          } catch (e: any) {
            const message = e?.message || String(e);
            this.warnings.push(
              `${seed.inventoryNumber}: nepodařilo se načíst MARC záznam – ${message}`
            );
            bib = {
              mmsId: seed.mmsId,
              title: '',
              author: '',
              extent: '',
              isbn: '',
              issn: '',
              isSerial: false
            };
          }
          bibCache.set(seed.mmsId, bib);
        }

        let itemResponse = itemResponseCache.get(seed.mmsId);
        if (!itemResponse) {
          itemResponse = await this.loadRawItemsForMms(seed.mmsId);
          itemResponseCache.set(seed.mmsId, itemResponse);
        }

        this.addMatchingItem(seed, bib, itemResponse);
      }

      this.items.sort(
        (a, b) =>
          a.inventoryNumber.localeCompare(
            b.inventoryNumber,
            undefined,
            { numeric: true }
          )
      );

      const poLineCache =
        new Map<string, {
          acquisitionMethod: string;
          vendor: string;
          invoiceNumber: string;
        }>();

      for (let i = 0; i < this.items.length; i++) {
        const item = this.items[i];

        this.progressMessage =
          `Načítám akviziční údaje ${i + 1} / ${this.items.length}…`;

        if (this.isRetroItem(item.inventoryPrice, item.internalNote2)) {
          item.acquisitionMethod = 'Retrokatalogizace';
          item.inventoryPrice = '';
          continue;
        }

        if (!item.poLine) {
          continue;
        }

        if (poLineCache.has(item.poLine)) {
          const cached = poLineCache.get(item.poLine)!;
          item.acquisitionMethod = cached.acquisitionMethod;
          item.vendor = cached.vendor;
          item.invoiceNumber = cached.invoiceNumber;
          continue;
        }

        try {
          const acquisition = await this.loadAcquisitionData(item.poLine);
          poLineCache.set(item.poLine, acquisition);
          item.acquisitionMethod = acquisition.acquisitionMethod;
          item.vendor = acquisition.vendor;
          item.invoiceNumber = acquisition.invoiceNumber;
        } catch (e: any) {
          const message = e?.message || String(e);
          this.warnings.push(
            `${item.inventoryNumber}: PO line ${item.poLine} – ${message}`
          );
        }
      }

      this.progressMessage = '';

      const missing = seeds.length - this.items.length;
      this.resultMessage = `Načteno jednotek: ${this.items.length}.`;

      if (missing > 0) {
        this.warnings.push(
          `Analytics vrátil ${seeds.length} řádků, ale přes REST bylo nalezeno ${this.items.length} odpovídajících jednotek.`
        );
      }

    } catch (e: any) {
      this.progressMessage = '';
      this.errorMessage = e?.message || String(e);
      console.error(e);
    } finally {
      this.loading = false;
    }
  }

  private async loadAnalyticsSeeds(
    from: string,
    to: string
  ): Promise<AnalyticsSeed[]> {

    const filter =
      `<sawx:expr xsi:type="sawx:comparison" op="between" ` +
      `xmlns:saw="com.siebel.analytics.web/report/v1.1" ` +
      `xmlns:sawx="com.siebel.analytics.web/expression/v1.1" ` +
      `xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ` +
      `xmlns:xsd="http://www.w3.org/2001/XMLSchema">` +
      `<sawx:expr xsi:type="sawx:sqlExpression">` +
      `"Physical Item Details"."Inventory Number"` +
      `</sawx:expr>` +
      `<sawx:expr xsi:type="xsd:string">${this.escapeXml(from)}</sawx:expr>` +
      `<sawx:expr xsi:type="xsd:string">${this.escapeXml(to)}</sawx:expr>` +
      `</sawx:expr>`;

    const url =
      '/almaws/v1/analytics/reports' +
      `?path=${encodeURIComponent(this.analyticsReportPath)}` +
      `&filter=${encodeURIComponent(filter)}` +
      '&limit=1000' +
      '&col_names=true';

    const response: any = await firstValueFrom(
      this.restService.call<any>({
        url,
        headers: {
          accept: 'application/xml'
        }
      } as any)
    );

    console.log('Analytics raw response:', response);

    const seeds = this.parseAnalyticsResponse(response);
    console.log('Analytics seeds:', seeds);

    // Pojistka proti duplicitním řádkům Analytics.
    const unique = new Map<string, AnalyticsSeed>();
    for (const seed of seeds) {
      if (!seed.mmsId || !seed.inventoryNumber) {
        continue;
      }
      unique.set(`${seed.mmsId}|${seed.inventoryNumber}`, seed);
    }

    return Array.from(unique.values());
  }

  private parseAnalyticsResponse(response: any): AnalyticsSeed[] {
    // 1) XML Document / Element / XML string.
    const xmlDocument = this.toXmlDocument(response);
    if (xmlDocument) {
      const rowNodes = Array.from(
        xmlDocument.getElementsByTagNameNS('*', 'Row')
      );

      const parsed = rowNodes
        .map(row => ({
          mmsId: this.getXmlChildText(row, 'Column1'),
          inventoryNumber: this.getXmlChildText(row, 'Column2')
        }))
        .filter(row => !!row.mmsId && !!row.inventoryNumber);

      if (parsed.length > 0) {
        return parsed;
      }
    }

    // 2) CloudAppRestService může XML převést na JS objekt.
    // Struktura se může mezi verzemi knihovny lišit, proto Row hledáme
    // rekurzivně a nespoléháme pouze na jednu pevnou cestu.
    const rows = this.findAnalyticsRows(response);

    return rows
      .map((row: any) => ({
        mmsId: this.objectValue(this.getObjectProperty(row, 'Column1')),
        inventoryNumber: this.objectValue(this.getObjectProperty(row, 'Column2'))
      }))
      .filter((row: AnalyticsSeed) => !!row.mmsId && !!row.inventoryNumber);
  }

  private findAnalyticsRows(value: any): any[] {
    const found: any[] = [];
    const seen = new Set<any>();

    const visit = (node: any): void => {
      if (node === null || node === undefined) {
        return;
      }

      if (typeof node !== 'object') {
        return;
      }

      if (seen.has(node)) {
        return;
      }
      seen.add(node);

      if (Array.isArray(node)) {
        for (const item of node) {
          visit(item);
        }
        return;
      }

      for (const key of Object.keys(node)) {
        const child = node[key];
        const localKey = key.includes(':') ? key.split(':').pop()! : key;

        if (localKey.toLowerCase() === 'row') {
          if (Array.isArray(child)) {
            found.push(...child);
          } else if (child) {
            found.push(child);
          }
          continue;
        }

        visit(child);
      }
    };

    visit(value);
    return found;
  }

  private getObjectProperty(value: any, wantedName: string): any {
    if (!value || typeof value !== 'object') {
      return undefined;
    }

    if (Object.prototype.hasOwnProperty.call(value, wantedName)) {
      return value[wantedName];
    }

    const wanted = wantedName.toLowerCase();
    for (const key of Object.keys(value)) {
      const localKey = key.includes(':') ? key.split(':').pop()! : key;
      if (localKey.toLowerCase() === wanted) {
        return value[key];
      }
    }

    return undefined;
  }

  private objectValue(value: any): string {
    if (value === null || value === undefined) {
      return '';
    }
    if (typeof value === 'string' || typeof value === 'number') {
      return String(value).trim();
    }
    if (typeof value === 'object') {
      if (typeof value.textContent === 'string') {
        return value.textContent.trim();
      }
      return String(
        value['#text'] ??
        value['_'] ??
        value['text'] ??
        value['_text'] ??
        value['__text'] ??
        value['$text'] ??
        ''
      ).trim();
    }
    return String(value).trim();
  }

  private async loadBibRecord(mmsId: string): Promise<BibRecord> {
    const url =
      `/almaws/v1/bibs/${encodeURIComponent(mmsId)}` +
      '?view=full&format=xml';

    const response: any = await firstValueFrom(
      this.restService.call<any>({
        url,
        headers: {
          accept: 'application/xml'
        }
      } as any)
    );

    const document = this.toXmlDocument(response);

    if (!document) {
      throw new Error('REST API nevrátilo čitelný MARCXML záznam.');
    }

    const recordNode =
      document.getElementsByTagNameNS(
        'http://www.loc.gov/MARC21/slim',
        'record'
      )[0] ||
      document.getElementsByTagNameNS('*', 'record')[0];

    if (!recordNode) {
      throw new Error('V odpovědi není MARC record.');
    }

    return this.parseMarcRecord(recordNode, mmsId);
  }

  private parseMarcRecord(recordNode: Element, fallbackMmsId: string): BibRecord {
    let mmsId = fallbackMmsId;
    let title = '';
    let author = '';
    let extent = '';
    let isbn = '';
    let issn = '';
    let isSerial = false;

    const leaderNode = recordNode.getElementsByTagNameNS('*', 'leader')[0];
    const leader = leaderNode?.textContent || '';

    if (leader.length > 7) {
      const bibliographicLevel = leader.charAt(7);
      isSerial = bibliographicLevel === 's' || bibliographicLevel === 'i';
    }

    const controlFields = Array.from(
      recordNode.getElementsByTagNameNS('*', 'controlfield')
    );

    for (const field of controlFields) {
      if (field.getAttribute('tag') === '001') {
        mmsId = field.textContent?.trim() || mmsId;
      }
    }

    const dataFields = Array.from(
      recordNode.getElementsByTagNameNS('*', 'datafield')
    );

    for (const field of dataFields) {
      const tag = field.getAttribute('tag');
      const subfields = Array.from(
        field.getElementsByTagNameNS('*', 'subfield')
      );

      if (tag === '245' && !title) {
        const parts: string[] = [];
        for (const subfield of subfields) {
          const code = subfield.getAttribute('code');
          if (code === 'a' || code === 'b' || code === 'n' || code === 'p') {
            const value = subfield.textContent?.trim();
            if (value) {
              parts.push(value);
            }
          }
        }
        title = parts.join(' ');
      }

      if (tag === '100' && !author) {
        author = this.getSubfield(subfields, 'a');
      }

      if (tag === '300' && !extent) {
        extent = this.getSubfield(subfields, 'a');
      }

      if (tag === '020' && !isbn) {
        isbn = this.getSubfield(subfields, 'a');
      }

      if (tag === '022' && !issn) {
        issn = this.getSubfield(subfields, 'a');
      }
    }

    return {
      mmsId,
      title,
      author,
      extent,
      isbn,
      issn,
      isSerial
    };
  }

  private addMatchingItem(
    seed: AnalyticsSeed,
    bib: BibRecord,
    response: any
  ): void {
    const itemList = response?.item || [];

    for (const item of itemList) {
      const itemData = item?.item_data || {};
      const bibData = item?.bib_data || {};
      const holdingData = item?.holding_data || {};

      const inventoryNumber = String(itemData.inventory_number || '').trim();

      if (inventoryNumber !== seed.inventoryNumber) {
        continue;
      }

      const callNumber =
        itemData.alternative_call_number ||
        holdingData.call_number ||
        holdingData.permanent_call_number ||
        '';

      const location =
        itemData.location?.desc ||
        itemData.location?.value ||
        '';

      const materialType =
        itemData.physical_material_type?.value ||
        itemData.physical_material_type?.desc ||
        '';

      const inventoryPrice = itemData.inventory_price ?? '';

      this.items.push({
        inventoryNumber,
        callNumber: String(callNumber),
        location: String(location),
        mmsId: String(bibData.mms_id || seed.mmsId),
        title: bibData.title || bib.title || '',
        author: bibData.author || bib.author || '',
        extent: bib.extent,
        isbn: bib.isbn,
        issn: bib.issn,
        isSerial: bib.isSerial,
        description: String(itemData.description || ''),
        materialType: String(materialType),
        inventoryDate: String(itemData.inventory_date || ''),
        inventoryPrice: String(inventoryPrice),
        internalNote2: String(itemData.internal_note_2 || ''),
        poLine: String(itemData.po_line || ''),
        acquisitionMethod: '',
        vendor: '',
        invoiceNumber: '',
        barcode: String(itemData.barcode || '')
      });

      return;
    }

    this.warnings.push(
      `${seed.inventoryNumber}: Analytics vrátil MMS ${seed.mmsId}, ale jednotka s tímto přírůstkovým číslem nebyla v REST odpovědi nalezena.`
    );
  }

  private async loadRawItemsForMms(mmsId: string): Promise<any> {
    const url =
      `/almaws/v1/bibs/${mmsId}` +
      `/holdings/ALL/items` +
      `?limit=100&format=json`;

    return await firstValueFrom(
      this.restService.call<any>(url)
    );
  }

  private async loadAcquisitionData(
    poLine: string
  ): Promise<{
    acquisitionMethod: string;
    vendor: string;
    invoiceNumber: string;
  }> {
    const poUrl =
      `/almaws/v1/acq/po-lines/${encodeURIComponent(poLine)}?format=json`;

    const po: any = await firstValueFrom(
      this.restService.call<any>(poUrl)
    );

    const rawMethod =
      po?.acquisition_method?.desc ||
      po?.acquisition_method?.value ||
      '';

    const acquisitionMethod =
      this.translateAcquisitionMethod(String(rawMethod));

    const vendor = String(po?.vendor?.value || '');

    let invoiceNumber = '';

    try {
      const q = `pol_number~${poLine}`;
      const invoiceUrl =
        `/almaws/v1/acq/invoices` +
        `?q=${encodeURIComponent(q)}` +
        `&limit=100&format=json`;

      const invoiceResponse: any = await firstValueFrom(
        this.restService.call<any>(invoiceUrl)
      );

      const invoiceList = invoiceResponse?.invoice || [];
      const numbers = Array.from(
        new Set<string>(
          invoiceList
            .map((invoice: any) => String(invoice?.number || '').trim())
            .filter((number: string) => !!number)
        )
      );

      invoiceNumber = numbers.join(', ');
    } catch (e) {
      console.warn(`Nepodařilo se načíst fakturu pro PO line ${poLine}`, e);
    }

    return {
      acquisitionMethod,
      vendor,
      invoiceNumber
    };
  }

  private translateAcquisitionMethod(value: string): string {
    const normalized = value.trim().toUpperCase();

    switch (normalized) {
      case 'PURCHASE':
        return 'Nákup';
      case 'GIFT':
        return 'Dar';
      case 'EXCHANGE':
        return 'Výměna';
      case 'LEGAL DEPOSIT':
      case 'LEGAL_DEPOSIT':
      case 'LEGALDEPOSIT':
        return 'Povinný výtisk';
      case 'NONE':
        return '';
      default:
        return value;
    }
  }

  private isRetroItem(price: string, internalNote2: string): boolean {
    const normalizedPrice = String(price).trim().replace(',', '.');

    if (
      normalizedPrice === '-1' ||
      normalizedPrice === '-1.0' ||
      normalizedPrice === '-1.00'
    ) {
      return true;
    }

    return /Z30-PRICE\s*:\s*-1(?:\.0+)?(?:\s|$)/i
      .test(String(internalNote2 || ''));
  }

  private isJournalLike(item: InventoryItem): boolean {
    const mt = String(item.materialType || '').toUpperCase();

    return (
      !!item.issn ||
      mt.includes('ISSBD') ||
      mt.includes('JOURNAL') ||
      mt.includes('SERIAL') ||
      mt.includes('ISSUE') ||
      mt.includes('CONTINUING')
    );
  }

  getDescription(item: InventoryItem): string {
    const title = this.cleanTitle(item.title);
    const author = this.cleanAuthor(item.author);

    if (this.isJournalLike(item)) {
      const parts: string[] = [];
      if (title) {
        parts.push(title);
      }
      if (item.description && item.description.trim()) {
        parts.push(item.description.trim());
      }
      if (item.issn && item.issn.trim()) {
        parts.push(`ISSN ${item.issn.trim()}`);
      }
      return parts.join(' – ');
    }

    let text = title;
    if (author) {
      text += ` / ${author}`;
    }
    if (item.extent && item.extent.trim()) {
      text += ` – ${item.extent.trim()}`;
    }
    if (item.isbn && item.isbn.trim()) {
      text += ` – ISBN ${item.isbn.trim()}`;
    }
    return text;
  }

  private cleanTitle(value: string): string {
    return String(value || '')
      .trim()
      .replace(/\s*\/+\s*$/, '')
      .trim();
  }

  private cleanAuthor(value: string): string {
    return String(value || '')
      .trim()
      .replace(/[,\s]+$/, '')
      .trim();
  }

  formatDate(value: string): string {
    if (!value) {
      return '';
    }

    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) {
      return value;
    }

    return `${Number(match[3])}.${Number(match[2])}.${match[1]}`;
  }

  formatPrice(value: string): string {
    if (!value) {
      return '';
    }

    const normalized = String(value).trim().replace(',', '.');
    const numberValue = Number(normalized);

    if (Number.isNaN(numberValue)) {
      return value;
    }

    return numberValue.toLocaleString(
      'cs-CZ',
      {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }
    );
  }

  private validateRange(
    from: string,
    to: string
  ): { ok: boolean; message: string } {
    if (!from || !to) {
      return {
        ok: false,
        message: 'Vyplňte přírůstkové číslo OD i DO.'
      };
    }

    const fromMatch = from.match(/^(.*?)(\d+)$/);
    const toMatch = to.match(/^(.*?)(\d+)$/);

    if (!fromMatch || !toMatch) {
      return {
        ok: false,
        message: 'Přírůstkové číslo musí končit číselnou částí.'
      };
    }

    if (fromMatch[1] !== toMatch[1]) {
      return {
        ok: false,
        message: 'Přírůstková čísla OD a DO musí mít stejný prefix.'
      };
    }

    if (fromMatch[2].length !== toMatch[2].length) {
      return {
        ok: false,
        message: 'Číselná část přírůstkového čísla OD a DO musí mít stejnou délku.'
      };
    }

    const fromNumber = Number(fromMatch[2]);
    const toNumber = Number(toMatch[2]);

    if (toNumber < fromNumber) {
      return {
        ok: false,
        message: 'Přírůstkové číslo DO nesmí být menší než OD.'
      };
    }

    const count = toNumber - fromNumber + 1;

    if (count > 1000) {
      return {
        ok: false,
        message: 'Rozsah může obsahovat maximálně 1000 přírůstkových čísel.'
      };
    }

    return { ok: true, message: '' };
  }

  async createPdf(): Promise<void> {
    if (this.items.length === 0 || this.creatingPdf) {
      return;
    }

    this.errorMessage = '';
    this.clearPdfLink();
    this.creatingPdf = true;
    this.progressMessage = 'Vytvářím PDF…';

    let host: HTMLDivElement | null = null;

    try {
      const pageChunks: InventoryItem[][] = [];
      for (let i = 0; i < this.items.length; i += 10) {
        pageChunks.push(this.items.slice(i, i + 10));
      }

      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4',
        compress: true
      });

      host = document.createElement('div');
      host.id = 'pdf-render-host';
      host.style.position = 'fixed';
      host.style.left = '-20000px';
      host.style.top = '0';
      host.style.width = '1123px';
      host.style.background = '#fff';
      host.style.zIndex = '-9999';
      document.body.appendChild(host);

      for (let pageIndex = 0; pageIndex < pageChunks.length; pageIndex++) {
        this.progressMessage =
          `Vytvářím PDF: strana ${pageIndex + 1} / ${pageChunks.length}…`;

        host.innerHTML = this.buildPdfPageHtml(
          pageChunks[pageIndex],
          pageIndex + 1,
          pageChunks.length
        );

        await new Promise(resolve => setTimeout(resolve, 50));

        const pageElement = host.querySelector('.pdf-page') as HTMLElement | null;
        if (!pageElement) {
          throw new Error('Nepodařilo se vytvořit stránku PDF.');
        }

        const canvas = await html2canvas(pageElement, {
          scale: 2,
          backgroundColor: '#ffffff',
          useCORS: true,
          logging: false
        });

        const imageData = canvas.toDataURL('image/jpeg', 0.93);

        if (pageIndex > 0) {
          pdf.addPage('a4', 'landscape');
        }

        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();

        pdf.addImage(
          imageData,
          'JPEG',
          0,
          0,
          pageWidth,
          pageHeight,
          undefined,
          'FAST'
        );
      }

      const safeFrom = this.inventoryFrom.trim().replace(/[^A-Za-z0-9._-]+/g, '_');
      const safeTo = this.inventoryTo.trim().replace(/[^A-Za-z0-9._-]+/g, '_');

      this.pdfFilename = `prirustkovy-seznam_${safeFrom}_${safeTo}.pdf`;

      const blob = pdf.output('blob');
      this.pdfUrl = URL.createObjectURL(blob);
      this.progressMessage = '';
      this.resultMessage =
        `PDF připraveno: ${pageChunks.length} stran, ${this.items.length} jednotek. ` +
        `Klikněte na „Stáhnout PDF“.`;

    } catch (e: any) {
      this.progressMessage = '';
      this.errorMessage =
        `PDF se nepodařilo vytvořit: ${e?.message || String(e)}`;
      console.error(e);
    } finally {
      if (host) {
        host.remove();
      }
      this.creatingPdf = false;
    }
  }

  private clearPdfLink(): void {
    if (this.pdfUrl) {
      URL.revokeObjectURL(this.pdfUrl);
    }
    this.pdfUrl = '';
    this.pdfFilename = '';
  }

  private buildPdfPageHtml(
    items: InventoryItem[],
    pageNumber: number,
    pageCount: number
  ): string {
    const rows = items.map(item => `
      <tr>
        <td class="nowrap">${this.escapeHtml(item.inventoryNumber)}</td>
        <td>${this.escapeHtml(item.callNumber)}</td>
        <td>${this.escapeHtml(item.location)}</td>
        <td class="description">${this.escapeHtml(this.getDescription(item))}</td>
        <td class="nowrap">${this.escapeHtml(item.mmsId)}</td>
        <td>${this.escapeHtml(item.acquisitionMethod)}</td>
        <td class="price nowrap">${this.escapeHtml(this.formatPrice(item.inventoryPrice))}</td>
        <td class="nowrap">${this.escapeHtml(this.formatDate(item.inventoryDate))}</td>
        <td>${this.escapeHtml(item.invoiceNumber)}</td>
        <td>${this.escapeHtml(item.vendor)}</td>
      </tr>
    `).join('');

    return `
      <div class="pdf-page">
        <style>
          .pdf-page { box-sizing: border-box; width: 1123px; height: 794px; padding: 30px 26px; background: #fff; color: #000; font-family: Arial, Helvetica, sans-serif; overflow: hidden; }
          .pdf-header { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 14px; }
          .pdf-header h1 { margin: 0; font-size: 22px; line-height: 1.1; }
          .pdf-institution { margin-top: 4px; font-size: 12px; }
          .pdf-meta { font-size: 12px; text-align: right; line-height: 1.35; }
          table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 10px; line-height: 1.18; }
          th, td { box-sizing: border-box; border: 1px solid #888; padding: 5px 5px; vertical-align: top; overflow-wrap: anywhere; }
          th { font-weight: 700; text-align: left; background: #f2f2f2; }
          tbody tr { height: 66px; }
          .nowrap { white-space: nowrap; }
          .price { text-align: right; }
          .description { line-height: 1.18; }
          .c1 { width: 9%; } .c2 { width: 6%; } .c3 { width: 11%; } .c4 { width: 28%; } .c5 { width: 11%; }
          .c6 { width: 10%; } .c7 { width: 6%; } .c8 { width: 8%; } .c9 { width: 7%; } .c10 { width: 9%; }
        </style>

        <div class="pdf-header">
          <div>
            <h1>Přírůstkový seznam</h1>
            ${this.institutionName ? `<div class="pdf-institution">${this.escapeHtml(this.institutionName)}</div>` : ''}
          </div>
          <div class="pdf-meta">
            <div>${this.escapeHtml(this.inventoryFrom)} - ${this.escapeHtml(this.inventoryTo)}</div>
            <div>Strana ${pageNumber} / ${pageCount}</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th class="c1">Přír. číslo</th>
              <th class="c2">Signatura</th>
              <th class="c3">Pracoviště</th>
              <th class="c4">Popisné údaje</th>
              <th class="c5">MMS ID</th>
              <th class="c6">Způsob pořízení</th>
              <th class="c7">Cena</th>
              <th class="c8">Datum přír. čísla</th>
              <th class="c9">Číslo faktury</th>
              <th class="c10">Dodavatel</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  private toXmlDocument(value: any): XMLDocument | null {
    if (!value) {
      return null;
    }

    if (value instanceof Document) {
      return value as XMLDocument;
    }

    if (value instanceof Element) {
      const xml = new XMLSerializer().serializeToString(value);
      return this.parseXmlString(xml);
    }

    if (typeof value === 'string') {
      return this.parseXmlString(value);
    }

    // Některé XML odpovědi mohou být zabalené do vlastnosti record/ResultXml.
    const candidate =
      value?.record ??
      value?.bib?.record ??
      value?.report?.QueryResult?.ResultXml ??
      null;

    if (candidate instanceof Element) {
      const xml = new XMLSerializer().serializeToString(candidate);
      return this.parseXmlString(xml);
    }

    if (typeof candidate === 'string') {
      const parsed = this.parseXmlString(candidate);
      if (parsed) {
        return parsed;
      }
    }

    // CloudAppRestService může XML z Alma Analytics (a někdy i jiné XML
    // endpointy) vrátit zabalené např. jako { entities: ["<QueryResult>…"] }.
    // Projdeme proto odpověď rekurzivně a vezmeme první platný XML řetězec.
    const seen = new Set<any>();

    const findXml = (node: any): XMLDocument | null => {
      if (node === null || node === undefined) {
        return null;
      }

      if (typeof node === 'string') {
        const text = node.trim();
        if (!text.startsWith('<')) {
          return null;
        }
        return this.parseXmlString(text);
      }

      if (node instanceof Document) {
        return node as XMLDocument;
      }

      if (node instanceof Element) {
        const xml = new XMLSerializer().serializeToString(node);
        return this.parseXmlString(xml);
      }

      if (typeof node !== 'object' || seen.has(node)) {
        return null;
      }
      seen.add(node);

      if (Array.isArray(node)) {
        for (const item of node) {
          const parsed = findXml(item);
          if (parsed) {
            return parsed;
          }
        }
        return null;
      }

      for (const key of Object.keys(node)) {
        const parsed = findXml(node[key]);
        if (parsed) {
          return parsed;
        }
      }

      return null;
    };

    return findXml(value);
  }

  private parseXmlString(xml: string): XMLDocument | null {
    const document = new DOMParser().parseFromString(xml, 'application/xml');
    if (document.querySelector('parsererror')) {
      return null;
    }
    return document;
  }

  private getXmlChildText(row: Element, localName: string): string {
    const node = row.getElementsByTagNameNS('*', localName)[0];
    return node?.textContent?.trim() || '';
  }

  private getSubfield(subfields: Element[], code: string): string {
    for (const subfield of subfields) {
      if (subfield.getAttribute('code') === code) {
        return subfield.textContent?.trim() || '';
      }
    }
    return '';
  }

  private escapeXml(value: string): string {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  private escapeHtml(value: string): string {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
