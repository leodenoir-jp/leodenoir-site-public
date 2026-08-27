-- Preserve the pricing basis used for each lesson purchase offer.
-- Safe to run repeatedly against an existing project.
alter table public.lesson_purchase_offers
  add column if not exists base_price numeric not null default 0 check (base_price >= 0);

alter table public.lesson_purchase_offers
  add column if not exists payment_adjusted_price numeric not null default 0 check (payment_adjusted_price >= 0);

alter table public.lesson_purchase_offers
  add column if not exists variable_processing_rate numeric not null default 0 check (variable_processing_rate >= 0 and variable_processing_rate < 1);

alter table public.lesson_purchase_offers
  add column if not exists pricing_reference_rate numeric not null default 0 check (pricing_reference_rate >= 0 and pricing_reference_rate < 1);

alter table public.lesson_purchase_offers
  add column if not exists final_customer_price numeric not null default 0 check (final_customer_price >= 0);
