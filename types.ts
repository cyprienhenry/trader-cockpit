export type Status = "Arrived" | "At sea" | "Scheduled";

export interface PalletItem {
  booking_reference: string;
  shipment_id: string;
  container_id: string;
  container_code: string;
  carrier_name: string;
  port_destination: string;
  port_origin?: string;
  vessel_name: string;
  voyage_number: string;
  etd: string;
  eta: string;
  product: string;
  variety: string;
  caliber_raw: string;
  pack_format_raw: string;
  box_count: number;
  box_weight_kg: number;
  line_weight_kg: number;
  line_id: number;
  brand?: string;
  pack_format_code?: string;
  caliber_code?: string;
  pallet_pl_id?: string;
  pl_document_id?: string;
}

export type PalletRow = PalletItem & {
  etaDate: Date;
  etdDate: Date;
};

export interface PalletDataset {
  palletitems: PalletItem[];
}
