// Camouflage websites shown at "/" when the cover site is enabled (Settings → Cover site).
// Deliberately contains nothing about VPN / proxy / filtering.

export type CoverTheme = "network" | "construction" | "medical" | "education" | "accounting";
type Item = { icon: string; title: string; text: string };
export type CoverContent = {
  name: string; tagline: string; hero: string; cta: string; color: string; color2: string;
  services: Item[]; stats: [string, string][]; about: string; steps: Item[]; faq: [string, string][]; testimonials: [string, string][];
  labels: { services: string; about: string; process: string; faq: string; reviews: string; contact: string; phone: string; email: string; address: string; hours: string; hoursValue: string; rights: string; request: string; nameField: string; phoneField: string; msgField: string; send: string };
};

const L_FA = { services: "خدمات ما", about: "دربارهٔ ما", process: "روند همکاری", faq: "پرسش‌های متداول", reviews: "نظر مشتریان", contact: "تماس با ما", phone: "تلفن", email: "ایمیل", address: "نشانی", hours: "ساعات کاری", hoursValue: "شنبه تا پنجشنبه ۸ تا ۱۸", rights: "تمامی حقوق محفوظ است.", request: "درخواست مشاوره رایگان", nameField: "نام و نام خانوادگی", phoneField: "شماره تماس", msgField: "توضیحات", send: "ارسال درخواست" };
const L_EN = { services: "Our services", about: "About us", process: "How we work", faq: "FAQ", reviews: "Testimonials", contact: "Contact", phone: "Phone", email: "Email", address: "Address", hours: "Office hours", hoursValue: "Sat–Thu 8:00–18:00", rights: "All rights reserved.", request: "Request a free consultation", nameField: "Full name", phoneField: "Phone number", msgField: "Message", send: "Send request" };

const FA: Record<CoverTheme, Omit<CoverContent, "labels">> = {
  network: {
    name: "پارس‌نت سامانه", tagline: "راهکارهای جامع شبکه و فناوری اطلاعات", color: "#2563eb", color2: "#06b6d4", cta: "مشاوره رایگان",
    hero: "طراحی، اجرا و پشتیبانی شبکهٔ سازمان‌ها، فروشگاه‌ها و ادارات با تیمی متخصص و پاسخ‌گویی سریع.",
    services: [
      { icon: "🖧", title: "طراحی و اجرای شبکه", text: "کابل‌کشی ساخت‌یافته، رک و پسیو، شبکهٔ بی‌سیم سازمانی و مستندسازی کامل." },
      { icon: "🛡️", title: "امنیت اطلاعات", text: "فایروال، آنتی‌ویروس سازمانی، سیاست‌های دسترسی و آموزش کارکنان." },
      { icon: "🗄️", title: "سرور و مجازی‌سازی", text: "راه‌اندازی سرور، مجازی‌سازی، استوریج و پشتیبان‌گیری خودکار." },
      { icon: "📹", title: "دوربین مداربسته", text: "نصب و پیکربندی دوربین تحت شبکه با امکان مشاهدهٔ از راه دور." },
      { icon: "🧰", title: "پشتیبانی قراردادی", text: "پشتیبانی ماهانه با زمان پاسخ‌گویی تضمینی و سرویس دوره‌ای." },
      { icon: "🌐", title: "طراحی وب‌سایت", text: "طراحی وب‌سایت شرکتی و فروشگاهی، میزبانی و نگهداری." },
    ],
    stats: [["۱۲+", "سال تجربه"], ["۴۵۰+", "پروژهٔ موفق"], ["۱۲۰+", "قرارداد پشتیبانی"], ["۲۴/۷", "پاسخ‌گویی"]],
    about: "ما از سال ۱۳۹۲ با تمرکز بر کیفیت اجرا و پشتیبانی واقعی در کنار کسب‌وکارها هستیم. تیم ما متشکل از کارشناسان دارای مدارک بین‌المللی شبکه و امنیت است و برای هر پروژه پیش از اجرا، نیازسنجی و طراحی دقیق انجام می‌دهد.",
    steps: [{ icon: "1", title: "بازدید و نیازسنجی", text: "بازدید رایگان از محل و بررسی نیازها" }, { icon: "2", title: "طراحی و پیش‌فاکتور", text: "ارائهٔ طرح فنی و هزینهٔ شفاف" }, { icon: "3", title: "اجرا و تحویل", text: "اجرا مطابق استاندارد و تحویل مستندات" }, { icon: "4", title: "پشتیبانی", text: "خدمات پس از فروش و نگهداری" }],
    faq: [["بازدید اولیه هزینه دارد؟", "خیر، بازدید و مشاورهٔ اولیه در شهر رایگان است."], ["تجهیزات گارانتی دارند؟", "بله، تمام تجهیزات دارای گارانتی معتبر هستند."], ["قرارداد پشتیبانی چگونه است؟", "قراردادها ماهانه یا سالانه با سطح خدمات مشخص تنظیم می‌شوند."]],
    testimonials: [["مدیر اداری شرکت بازرگانی", "شبکهٔ دفتر ما کاملاً بازطراحی شد و از آن زمان هیچ قطعی نداشته‌ایم."], ["مالک فروشگاه زنجیره‌ای", "پشتیبانی سریع و دقیق؛ همیشه در دسترس هستند."]],
  },
  construction: {
    name: "گروه ساختمانی آرمان‌سازه", tagline: "طراحی، اجرا و بازسازی ساختمان", color: "#d97706", color2: "#dc2626", cta: "درخواست بازدید",
    hero: "از طراحی معماری تا تحویل کلید؛ اجرای پروژه‌های مسکونی و تجاری با کیفیت، زمان‌بندی دقیق و قرارداد شفاف.",
    services: [
      { icon: "📐", title: "طراحی و نظارت", text: "طراحی معماری و سازه، اخذ مجوزها و نظارت مقیم." },
      { icon: "🏗️", title: "اجرای ساختمان", text: "اجرای اسکلت، سفت‌کاری و نازک‌کاری با مصالح استاندارد." },
      { icon: "🛠️", title: "بازسازی و نوسازی", text: "بازسازی کامل آپارتمان، آشپزخانه و سرویس‌ها." },
      { icon: "🔌", title: "تأسیسات", text: "تأسیسات مکانیکی، برقی، لوله‌کشی و گرمایش از کف." },
      { icon: "🧱", title: "نما و محوطه", text: "اجرای نمای سنگ، کامپوزیت و محوطه‌سازی." },
      { icon: "💧", title: "عایق و آب‌بندی", text: "عایق‌کاری بام، سرویس‌ها و استخر با ضمانت." },
    ],
    stats: [["۱۸+", "سال سابقه"], ["۲۳۰+", "پروژهٔ تحویل‌شده"], ["۶۰+", "متخصص"], ["۱۰۰٪", "تعهد زمان‌بندی"]],
    about: "آرمان‌سازه با بیش از ۱۸ سال سابقه در اجرای پروژه‌های ساختمانی، کیفیت و ایمنی را اولویت خود می‌داند. همهٔ پروژه‌ها با قرارداد رسمی، جدول زمان‌بندی و گزارش پیشرفت هفتگی انجام می‌شوند.",
    steps: [{ icon: "1", title: "بازدید فنی", text: "بازدید و برآورد اولیه" }, { icon: "2", title: "طراحی و قرارداد", text: "نقشه، متره و قرارداد" }, { icon: "3", title: "اجرا", text: "اجرا با نظارت و گزارش هفتگی" }, { icon: "4", title: "تحویل و ضمانت", text: "تحویل و ضمانت‌نامهٔ کتبی" }],
    faq: [["هزینهٔ بازسازی چگونه برآورد می‌شود؟", "پس از بازدید و بر اساس متراژ و متریال انتخابی، برآورد دقیق ارائه می‌شود."], ["آیا ضمانت دارید؟", "بله، برای اجرا و عایق‌کاری ضمانت‌نامهٔ کتبی ارائه می‌شود."], ["زمان اجرای بازسازی آپارتمان؟", "به طور معمول بین ۴ تا ۸ هفته."]],
    testimonials: [["مالک واحد مسکونی", "بازسازی خانه دقیقاً طبق زمان‌بندی تحویل شد."], ["سرمایه‌گذار پروژهٔ تجاری", "نظارت دقیق و گزارش‌دهی منظم، اعتماد ما را جلب کرد."]],
  },
  medical: {
    name: "کلینیک تخصصی مهرگان", tagline: "مراقبت تخصصی با رویکرد انسانی", color: "#0d9488", color2: "#2563eb", cta: "رزرو نوبت",
    hero: "خدمات تخصصی دندانپزشکی، پوست و مو، فیزیوتراپی و تغذیه با پزشکان مجرب و تجهیزات به‌روز.",
    services: [
      { icon: "🦷", title: "دندانپزشکی", text: "ایمپلنت، ارتودنسی، زیبایی و عصب‌کشی." },
      { icon: "🧴", title: "پوست و مو", text: "درمان‌های پوستی، لیزر و مراقبت از مو." },
      { icon: "🦴", title: "فیزیوتراپی", text: "توان‌بخشی، درمان دردهای مزمن و ورزشی." },
      { icon: "🥗", title: "تغذیه و رژیم", text: "برنامهٔ غذایی اختصاصی و پیگیری." },
      { icon: "🔬", title: "آزمایشگاه", text: "نمونه‌گیری در محل و جواب‌دهی سریع." },
      { icon: "📅", title: "نوبت‌دهی", text: "رزرو آسان و یادآوری پیامکی نوبت." },
    ],
    stats: [["۲۵+", "پزشک متخصص"], ["۴۰٬۰۰۰+", "مراجعهٔ موفق"], ["۱۰", "بخش تخصصی"], ["۹۸٪", "رضایت بیماران"]],
    about: "کلینیک مهرگان با هدف ارائهٔ خدمات درمانی باکیفیت در محیطی آرام و بهداشتی تأسیس شده است. تمامی پزشکان ما دارای بورد تخصصی هستند و پروتکل‌های بهداشتی به‌طور کامل رعایت می‌شود.",
    steps: [{ icon: "1", title: "رزرو نوبت", text: "تلفنی یا حضوری" }, { icon: "2", title: "معاینه", text: "معاینه و تشخیص دقیق" }, { icon: "3", title: "درمان", text: "طرح درمان شخصی‌سازی‌شده" }, { icon: "4", title: "پیگیری", text: "پیگیری پس از درمان" }],
    faq: [["طرف قرارداد بیمه هستید؟", "بله، با اغلب بیمه‌های تکمیلی قرارداد داریم."], ["امکان مشاوره قبل از درمان هست؟", "بله، جلسهٔ مشاوره با هزینهٔ اندک برگزار می‌شود."], ["ساعات کاری کلینیک؟", "همه‌روزه به جز جمعه از ۹ صبح تا ۹ شب."]],
    testimonials: [["بیمار بخش دندانپزشکی", "برخورد کادر بسیار محترمانه و درمان بدون درد بود."], ["مراجعه‌کنندهٔ فیزیوتراپی", "پس از چند جلسه درد کمرم کاملاً برطرف شد."]],
  },
  education: {
    name: "آموزشگاه دانش‌پژوهان", tagline: "آموزش زبان، کنکور و مهارت‌های دیجیتال", color: "#7c3aed", color2: "#db2777", cta: "ثبت‌نام",
    hero: "کلاس‌های حضوری و آنلاین زبان انگلیسی، آمادگی کنکور، برنامه‌نویسی و مهارت‌های کامپیوتر با اساتید مجرب.",
    services: [
      { icon: "🗣️", title: "زبان انگلیسی", text: "دوره‌های عمومی، مکالمه، آیلتس و تافل." },
      { icon: "📚", title: "آمادگی کنکور", text: "کلاس‌های تست‌زنی، آزمون آزمایشی و مشاوره." },
      { icon: "💻", title: "برنامه‌نویسی", text: "پایتون، طراحی وب و مبانی هوش مصنوعی." },
      { icon: "🖥️", title: "مهارت‌های کامپیوتر", text: "ICDL، آفیس و حسابداری کامپیوتری." },
      { icon: "🎯", title: "مشاورهٔ تحصیلی", text: "برنامه‌ریزی درسی و انتخاب رشته." },
      { icon: "🌍", title: "کلاس آنلاین", text: "کلاس زنده با ضبط جلسات برای مرور." },
    ],
    stats: [["۱۵+", "سال سابقه"], ["۸٬۰۰۰+", "دانش‌آموخته"], ["۷۰+", "استاد مجرب"], ["۳۰+", "دورهٔ فعال"]],
    about: "آموزشگاه دانش‌پژوهان دارای مجوز رسمی و با بیش از ۱۵ سال تجربه، با کلاس‌های کم‌جمعیت و روش‌های نوین آموزشی به پیشرفت واقعی زبان‌آموزان و داوطلبان کمک می‌کند.",
    steps: [{ icon: "1", title: "تعیین سطح", text: "آزمون تعیین سطح رایگان" }, { icon: "2", title: "انتخاب دوره", text: "مشاوره و انتخاب کلاس" }, { icon: "3", title: "آموزش", text: "کلاس حضوری یا آنلاین" }, { icon: "4", title: "مدرک", text: "آزمون پایانی و گواهی‌نامه" }],
    faq: [["مدرک معتبر ارائه می‌شود؟", "بله، گواهی پایان دوره با مجوز رسمی صادر می‌شود."], ["کلاس‌ها چند نفره‌اند؟", "حداکثر ۱۰ نفر در هر کلاس."], ["امکان پرداخت اقساطی هست؟", "بله، برای دوره‌های بلندمدت."]],
    testimonials: [["داوطلب کنکور", "با برنامه‌ریزی مشاوران، رتبه‌ام چشمگیر بهتر شد."], ["زبان‌آموز آیلتس", "در سه ماه به نمرهٔ مورد نظرم رسیدم."]],
  },
  accounting: {
    name: "مؤسسهٔ حسابداری تراز", tagline: "خدمات مالی، مالیاتی و ثبت شرکت", color: "#059669", color2: "#0284c7", cta: "مشاوره",
    hero: "حسابداری شرکت‌ها، تنظیم اظهارنامهٔ مالیاتی، حسابرسی داخلی و ثبت شرکت با کارشناسان رسمی.",
    services: [
      { icon: "📊", title: "حسابداری شرکت‌ها", text: "ثبت اسناد، بستن حساب‌ها و گزارش‌های مالی." },
      { icon: "🧾", title: "امور مالیاتی", text: "اظهارنامه، دفاتر قانونی و دفاع مالیاتی." },
      { icon: "🏢", title: "ثبت شرکت", text: "ثبت، تغییرات و صورتجلسات." },
      { icon: "🔎", title: "حسابرسی داخلی", text: "کنترل‌های داخلی و گزارش مدیریتی." },
      { icon: "💼", title: "بیمه و حقوق", text: "لیست بیمه و محاسبهٔ حقوق و دستمزد." },
      { icon: "🧮", title: "نرم‌افزار مالی", text: "راه‌اندازی و آموزش نرم‌افزارهای حسابداری." },
    ],
    stats: [["۲۰+", "سال تجربه"], ["۳۰۰+", "شرکت فعال"], ["۱۵", "کارشناس رسمی"], ["۱۰۰٪", "محرمانگی"]],
    about: "مؤسسهٔ تراز با همکاری کارشناسان رسمی و حسابداران خبره، امور مالی و مالیاتی کسب‌وکارهای کوچک و متوسط را با دقت و محرمانگی کامل انجام می‌دهد.",
    steps: [{ icon: "1", title: "جلسهٔ اولیه", text: "بررسی وضعیت مالی" }, { icon: "2", title: "پیشنهاد خدمات", text: "تعرفهٔ شفاف" }, { icon: "3", title: "اجرا", text: "انجام امور و گزارش ماهانه" }, { icon: "4", title: "پشتیبانی", text: "پاسخ‌گویی و مشاوره" }],
    faq: [["هزینهٔ خدمات ماهانه چقدر است؟", "بسته به حجم اسناد، تعرفه پس از جلسهٔ اولیه اعلام می‌شود."], ["خدمات غیرحضوری دارید؟", "بله، اسناد به‌صورت امن آنلاین دریافت می‌شوند."], ["مهلت اظهارنامه را یادآوری می‌کنید؟", "بله، تمام مهلت‌های قانونی یادآوری می‌شوند."]],
    testimonials: [["مدیرعامل شرکت تولیدی", "دفاتر و اظهارنامه‌ها همیشه به‌موقع و بدون مشکل."], ["صاحب کسب‌وکار نوپا", "ثبت شرکت ما در کوتاه‌ترین زمان انجام شد."]],
  },
};

const EN: Record<CoverTheme, Omit<CoverContent, "labels">> = {
  network: { ...FA.network, name: "ParsNet Systems", tagline: "Network & IT solutions for business", cta: "Free consultation", hero: "Design, installation and support of business networks with a certified team and fast response times.", services: [{ icon: "🖧", title: "Network design", text: "Structured cabling, racks and enterprise Wi-Fi." }, { icon: "🛡️", title: "Information security", text: "Firewalls, endpoint protection and access policies." }, { icon: "🗄️", title: "Servers & virtualization", text: "Server setup, storage and automated backups." }, { icon: "📹", title: "IP cameras", text: "Surveillance installation with remote viewing." }, { icon: "🧰", title: "Managed support", text: "Monthly plans with guaranteed response time." }, { icon: "🌐", title: "Web design", text: "Corporate websites, hosting and maintenance." }], stats: [["12+", "years"], ["450+", "projects"], ["120+", "support contracts"], ["24/7", "response"]], about: "Since 2013 we have helped businesses with reliable networks and real support. Our certified engineers plan every project carefully before deployment.", steps: [{ icon: "1", title: "Site survey", text: "Free on-site assessment" }, { icon: "2", title: "Design & quote", text: "Transparent proposal" }, { icon: "3", title: "Deployment", text: "Standards-based installation" }, { icon: "4", title: "Support", text: "Maintenance and service" }], faq: [["Is the site survey free?", "Yes, within the city it is free."], ["Do you provide warranty?", "All equipment comes with an official warranty."], ["How do support contracts work?", "Monthly or yearly with defined service levels."]], testimonials: [["Office manager", "Our office network was rebuilt and has had zero outages since."], ["Retail chain owner", "Fast and precise support, always reachable."]] },
  construction: { ...FA.construction, name: "Arman Build Group", tagline: "Design, construction & renovation", cta: "Book a visit", hero: "From architecture to key handover — residential and commercial projects delivered on time with transparent contracts.", services: [{ icon: "📐", title: "Design & supervision", text: "Architecture, structure and permits." }, { icon: "🏗️", title: "Construction", text: "Frame, masonry and finishing works." }, { icon: "🛠️", title: "Renovation", text: "Full apartment, kitchen and bathroom renovation." }, { icon: "🔌", title: "MEP", text: "Mechanical, electrical and floor heating." }, { icon: "🧱", title: "Facades", text: "Stone and composite facades, landscaping." }, { icon: "💧", title: "Waterproofing", text: "Roof and bathroom insulation with warranty." }], stats: [["18+", "years"], ["230+", "projects delivered"], ["60+", "specialists"], ["100%", "on schedule"]], about: "For over 18 years we have prioritised quality and safety. Every project has a formal contract, a schedule and weekly progress reports.", steps: [{ icon: "1", title: "Survey", text: "Technical visit and estimate" }, { icon: "2", title: "Design & contract", text: "Plans and contract" }, { icon: "3", title: "Build", text: "Supervised execution" }, { icon: "4", title: "Handover", text: "Written warranty" }], faq: [["How are renovation costs estimated?", "After a visit, based on area and materials."], ["Do you offer warranty?", "Yes, written warranties for works and insulation."], ["How long does a renovation take?", "Usually 4–8 weeks."]], testimonials: [["Homeowner", "Delivered exactly on schedule."], ["Commercial investor", "Precise supervision and regular reporting."]] },
  medical: { ...FA.medical, name: "Mehregan Specialty Clinic", tagline: "Specialist care with a human touch", cta: "Book appointment", hero: "Dentistry, dermatology, physiotherapy and nutrition with experienced physicians and modern equipment.", services: [{ icon: "🦷", title: "Dentistry", text: "Implants, orthodontics and cosmetic care." }, { icon: "🧴", title: "Skin & hair", text: "Dermatology treatments and laser." }, { icon: "🦴", title: "Physiotherapy", text: "Rehabilitation and sports injuries." }, { icon: "🥗", title: "Nutrition", text: "Personal diet plans and follow-up." }, { icon: "🔬", title: "Laboratory", text: "On-site sampling, fast results." }, { icon: "📅", title: "Appointments", text: "Easy booking with SMS reminders." }], stats: [["25+", "specialists"], ["40,000+", "patients"], ["10", "departments"], ["98%", "satisfaction"]], about: "Mehregan clinic provides high-quality care in a calm, hygienic environment. All physicians are board-certified.", steps: [{ icon: "1", title: "Booking", text: "By phone or in person" }, { icon: "2", title: "Examination", text: "Accurate diagnosis" }, { icon: "3", title: "Treatment", text: "Personalised plan" }, { icon: "4", title: "Follow-up", text: "Aftercare" }], faq: [["Do you accept insurance?", "Yes, most supplementary insurances."], ["Can I get a consultation first?", "Yes, for a small fee."], ["Opening hours?", "Daily except Friday, 9:00–21:00."]], testimonials: [["Dental patient", "Respectful staff and painless treatment."], ["Physiotherapy patient", "My back pain was gone after a few sessions."]] },
  education: { ...FA.education, name: "Daneshpajouhan Institute", tagline: "Languages, exam prep & digital skills", cta: "Enroll", hero: "In-person and online classes for English, university exam preparation, programming and computer skills.", services: [{ icon: "🗣️", title: "English", text: "General, conversation, IELTS and TOEFL." }, { icon: "📚", title: "Exam preparation", text: "Practice tests and counselling." }, { icon: "💻", title: "Programming", text: "Python, web design and AI basics." }, { icon: "🖥️", title: "Computer skills", text: "ICDL, Office and accounting software." }, { icon: "🎯", title: "Academic counselling", text: "Study planning and major selection." }, { icon: "🌍", title: "Online classes", text: "Live classes with recordings." }], stats: [["15+", "years"], ["8,000+", "graduates"], ["70+", "teachers"], ["30+", "courses"]], about: "A licensed institute with 15+ years of experience, small classes and modern teaching methods.", steps: [{ icon: "1", title: "Placement", text: "Free placement test" }, { icon: "2", title: "Choose a course", text: "Counselling" }, { icon: "3", title: "Learn", text: "In person or online" }, { icon: "4", title: "Certificate", text: "Final exam and certificate" }], faq: [["Is the certificate official?", "Yes, issued under an official licence."], ["Class size?", "Up to 10 students."], ["Instalments?", "Available for long courses."]], testimonials: [["Exam candidate", "My ranking improved dramatically."], ["IELTS student", "Reached my target band in three months."]] },
  accounting: { ...FA.accounting, name: "Taraz Accounting", tagline: "Accounting, tax & company registration", cta: "Consultation", hero: "Bookkeeping, tax returns, internal audit and company registration by certified experts.", services: [{ icon: "📊", title: "Bookkeeping", text: "Entries, closing and financial reports." }, { icon: "🧾", title: "Tax", text: "Returns, statutory books and tax defence." }, { icon: "🏢", title: "Company registration", text: "Registration and amendments." }, { icon: "🔎", title: "Internal audit", text: "Controls and management reports." }, { icon: "💼", title: "Payroll", text: "Payroll and social insurance lists." }, { icon: "🧮", title: "Software", text: "Setup and training of accounting software." }], stats: [["20+", "years"], ["300+", "clients"], ["15", "certified experts"], ["100%", "confidential"]], about: "We handle the finance and tax affairs of small and medium businesses accurately and confidentially.", steps: [{ icon: "1", title: "First meeting", text: "Review of your situation" }, { icon: "2", title: "Proposal", text: "Transparent fees" }, { icon: "3", title: "Execution", text: "Monthly reporting" }, { icon: "4", title: "Support", text: "Ongoing advice" }], faq: [["Monthly fee?", "Depends on volume; quoted after the first meeting."], ["Remote service?", "Yes, documents are received securely online."], ["Deadline reminders?", "Yes, for all statutory deadlines."]], testimonials: [["Manufacturing CEO", "Books and returns always on time."], ["Start-up founder", "Company registered in record time."]] },
};

export function coverContent(theme: string, lang: string, overrides: { businessName?: string; tagline?: string }): CoverContent {
  const th = (["network", "construction", "medical", "education", "accounting"].includes(theme) ? theme : "network") as CoverTheme;
  const base = (lang === "en" ? EN : FA)[th];
  return { ...base, name: overrides.businessName || base.name, tagline: overrides.tagline || base.tagline, labels: lang === "en" ? L_EN : L_FA };
}
