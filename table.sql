-- สร้างตารางทำเนียบเด็กฝึกงาน
create table interns (
  id bigint generated always as identity primary key,
  full_name text not null,          -- คำนำหน้า + ชื่อ-สกุล
  major text,                       -- สาขา
  university text,                  -- มหาวิทยาลัย
  previous_school text,             -- มาจากโรงเรียน
  start_date date,                  -- วันที่เริ่มฝึกงาน
  end_date date,                    -- วันที่สิ้นสุดฝึกงาน
  workplace text,                   -- หน่วยงานที่ฝึก
  intern_year int,                  -- ปีที่ฝึกงาน (พ.ศ.)
  responsibilities text,            -- งานที่ได้รับผิดชอบ
  reflection text,                  -- ความรู้สึกในวันที่ฝึกงานจบลง
  created_at timestamptz default now()
);

-- เปิด Row Level Security
alter table interns enable row level security;

-- อนุญาตให้อ่านข้อมูล
create policy "allow read" on interns
  for select using (true);

-- อนุญาตให้เพิ่มข้อมูล
create policy "allow insert" on interns
  for insert with check (true);