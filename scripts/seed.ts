import mongoose from "mongoose";
import bcrypt from "bcryptjs";

// MongoDB URI from environment
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error("XATO: MONGODB_URI muhit o'zgaruvchisi topilmadi (.env faylini tekshiring)");
  process.exit(1);
}

function generateRandomPassword(length = 8): string {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789ABCDEFGHJKMNPQRSTUVWXYZ";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

async function runSeed() {
  console.log("MongoDB ga ulanmoqda...");
  await mongoose.connect(MONGODB_URI!);
  console.log("MongoDB ga ulandi!");

  const db = mongoose.connection.db!;
  const groupsCollection = db.collection("groups");
  const usersCollection = db.collection("users");
  const lessonsCollection = db.collection("lessons");

  console.log("Eski test ma'lumotlari mavjudligi tekshirilmoqda...");

  // 1. Create the 5 cohorts
  const cohortsData = [
    { name: "8-A", grade: 8, academicYear: "2026-2027", isActive: true },
    { name: "8-B", grade: 8, academicYear: "2026-2027", isActive: true },
    { name: "9-A", grade: 9, academicYear: "2026-2027", isActive: true },
    { name: "9-B", grade: 9, academicYear: "2026-2027", isActive: true },
    { name: "11-A", grade: 11, academicYear: "2026-2027", isActive: true },
  ];

  const groupDocs: Array<{ _id: mongoose.Types.ObjectId; name: string; grade: number }> = [];

  for (const c of cohortsData) {
    let existing = await groupsCollection.findOne({ name: c.name });
    if (!existing) {
      const res = await groupsCollection.insertOne({
        ...c,
        studentCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      existing = { _id: res.insertedId, ...c };
    }
    groupDocs.push(existing as unknown as { _id: mongoose.Types.ObjectId; name: string; grade: number });
  }

  console.log(`5 ta guruh tayyorlandi: ${groupDocs.map((g) => g.name).join(", ")}`);

  const credentialsTable: Array<{ Rol: string; FIO: string; Login: string; Parol: string; Guruh: string }> = [];

  // 2. Create Mentor Account
  const mentorPassword = generateRandomPassword(10);
  const mentorHash = await bcrypt.hash(mentorPassword, 10);

  const existingMentor = await usersCollection.findOne({ login: "abbos_mentor" });
  if (!existingMentor) {
    await usersCollection.insertOne({
      fullName: "Abbos Mentor",
      login: "abbos_mentor",
      passwordHash: mentorHash,
      role: "mentor",
      groupId: null,
      mustChangePassword: false,
      totalCoins: 0,
      spendableBalance: 0,
      isHiddenFromLeaderboard: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    credentialsTable.push({
      Rol: "Mentor",
      FIO: "Abbos Mentor",
      Login: "abbos_mentor",
      Parol: mentorPassword,
      Guruh: "Barcha",
    });
  }

  // 3. Create Sample Students per group
  // Har bir guruh uchun alohida ismlar (login takrorlanmasligi uchun)
  const sampleStudentsByGroup: Record<string, string[]> = {
    "8-A": ["Alisher Valiyev", "Madina Karimova", "Javohir Oripov"],
    "8-B": ["Diyorbek Sobirov", "Sevara Tursunova", "Otabek Ismoilov"],
    "9-A": ["Sardorbek Rahimov", "Nigora Yusupova", "Bobur Mirzayev"],
    "9-B": ["Mironshoh Latipov", "Gulnoza Hamidova", "Islom Nazarov"],
    "11-A": ["Jasurbek Qosimov", "Shahlo Ahmedova", "Azizbek Normatov"],
  };

  for (const group of groupDocs) {
    const names = sampleStudentsByGroup[group.name] || [];

    let count = 0;
    for (const fullName of names) {
      const baseLogin = fullName.toLowerCase().replace(/\s+/g, "_");
      const existingStudent = await usersCollection.findOne({ login: baseLogin });

      if (!existingStudent) {
        const studentPassword = generateRandomPassword(8);
        const studentHash = await bcrypt.hash(studentPassword, 10);
        const coins = Math.floor(Math.random() * 80) + 20;

        await usersCollection.insertOne({
          fullName,
          login: baseLogin,
          passwordHash: studentHash,
          role: "student",
          groupId: group._id,
          mustChangePassword: true,
          totalCoins: coins,
          spendableBalance: coins,
          isHiddenFromLeaderboard: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        count++;
        credentialsTable.push({
          Rol: "Student",
          FIO: fullName,
          Login: baseLogin,
          Parol: studentPassword,
          Guruh: group.name,
        });
      }
    }

    if (count > 0) {
      const studentCount = await usersCollection.countDocuments({ groupId: group._id, role: "student" });
      await groupsCollection.updateOne({ _id: group._id }, { $set: { studentCount } });
    }
  }

  // 4. Create Sample Lessons for 8-A group
  const sampleGroup = groupDocs[0];
  const existingLessons = await lessonsCollection.countDocuments({ groupId: sampleGroup._id });

  if (existingLessons === 0) {
    await lessonsCollection.insertMany([
      {
        groupId: sampleGroup._id,
        quarter: 1,
        order: 1,
        title: "1-dars. Dasturlashga kirish va Python asoslari",
        topic: "Algoritm tushunchasi, sintaksis va o'zgaruvchilar",
        description:
          "Bugungi darsda biz dasturlash nima ekani, kompyuter qanday ishlashi va birinchi Python dasturimizni yozishni o'rganamiz.\n\nUy vazifasi:\n1. Python muhitini o'rnatish\n2. 3 ta har xil o'zgaruvchi yaratib konsolga chiqarish.",
        date: new Date(),
        isPublished: true,
        materials: [
          {
            type: "youtube",
            title: "Python darslari 1-qism",
            urlOrKey: "https://www.youtube.com/watch?v=kqtD5dpn9C8",
            createdAt: new Date(),
          },
          {
            type: "link",
            title: "Python rasmiy qo'llanmasi",
            urlOrKey: "https://docs.python.org/3/",
            createdAt: new Date(),
          },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        groupId: sampleGroup._id,
        quarter: 1,
        order: 2,
        title: "2-dars. Shart operatorlari (if, elif, else)",
        topic: "Mantiqiy ifodalar va tarmoqlanuvchi algoritmlar",
        description:
          "Dasturda qarorlar qabul qilish: if-elif-else tuzilmalari bilan ishlash.",
        date: new Date(),
        isPublished: true,
        materials: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
  }

  // 5. Create Sample Quiz for Lesson 1
  const quizzesCollection = db.collection("quizzes");
  const firstLesson = await lessonsCollection.findOne({ order: 1 });
  if (firstLesson) {
    const existingQuiz = await quizzesCollection.findOne({ lessonId: firstLesson._id });
    if (!existingQuiz) {
      await quizzesCollection.insertOne({
        lessonId: firstLesson._id,
        title: "1-dars bo'yicha tezkor test",
        description: "Python asoslari bo'yicha bilimlarni mustahkamlash",
        isPublished: true,
        passingScore: 60,
        questions: [
          {
            _id: new mongoose.Types.ObjectId(),
            type: "single_choice",
            prompt: "Pythonda konsolga ma'lumot chiqarish uchun qaysi funksiya ishlatiladi?",
            options: ["echo()", "print()", "console.log()", "System.out.println()"],
            correctAnswers: ["print()"],
            points: 1,
            explanation: "Pythonda standart konsolga chiqarish funksiyasi print() hisoblanadi.",
          },
          {
            _id: new mongoose.Types.ObjectId(),
            type: "multiple_choice",
            prompt: "Quyidagilardan qaysilari Pythonda to'g'ri ma'lumot turlari hisoblanadi?",
            options: ["int", "str", "boolean_type", "float", "number"],
            correctAnswers: ["int", "str", "float"],
            points: 2,
            explanation: "Pythonda int, str, float va bool asosiy ma'lumot turlaridir.",
          },
          {
            _id: new mongoose.Types.ObjectId(),
            type: "short_answer",
            prompt: "Butun sonlar ma'lumot turining nomi nima?",
            options: [],
            correctAnswers: ["int", "integer"],
            points: 1,
            explanation: "Butun sonlar int (integer) deb ataladi.",
          },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      console.log("Namunaviy kichik test (Quiz) yaratildi!");
    }
  }

  // 6. Create Sample Exam for groups
  const examsCollection = db.collection("exams");
  const existingExam = await examsCollection.findOne({ title: "1-chorak oraliq nazorat imtihoni" });
  if (!existingExam && groupDocs.length > 0) {
    await examsCollection.insertOne({
      groupIds: groupDocs.map((g) => g._id),
      quarter: 1,
      title: "1-chorak oraliq nazorat imtihoni",
      description: "Python asoslari, o'zgaruvchilar va shart operatorlari bo'yicha amaliy va nazariy nazorat ishi.",
      startTime: new Date(Date.now() - 24 * 60 * 60 * 1000), // kecha boshlangan
      endTime: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 kundan keyin tugaydi
      durationMinutes: 45,
      maxAttempts: 1,
      passingScore: 60,
      isPublished: true,
      isResultsPublished: false,
      questions: [
        {
          _id: new mongoose.Types.ObjectId(),
          type: "single_choice",
          prompt: "Qaysi belgi yordamida Pythonda bir qatorli izoh (comment) qoldiriladi?",
          options: ["//", "/*", "#", "--"],
          correctAnswers: ["#"],
          points: 5,
        },
        {
          _id: new mongoose.Types.ObjectId(),
          type: "multiple_choice",
          prompt: "Shart operatorida ishlatilishi mumkin bo'lgan kalit so'zlarni tanlang:",
          options: ["if", "elif", "else", "then", "switch"],
          correctAnswers: ["if", "elif", "else"],
          points: 5,
        },
        {
          _id: new mongoose.Types.ObjectId(),
          type: "open_ended",
          prompt: "O'zgaruvchi (variable) nima va unga nom berishda nimalarga e'tibor berish kerak? O'z so'zlaringiz bilan tushuntiring.",
          options: [],
          correctAnswers: [],
          points: 10,
        },
        {
          _id: new mongoose.Types.ObjectId(),
          type: "project_upload",
          prompt: "Kalkulyator dasturini yozing (qo'shish, ayirish, ko'paytirish, bo'lish) va dastur kodi faylini (.py yoki .zip) yuklang:",
          options: [],
          correctAnswers: [],
          points: 20,
          allowedFileTypes: [".zip", ".py", ".pdf", ".png"],
          maxFileSizeMb: 50,
        },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    console.log("Namunaviy imtihon (Exam) yaratildi!");
  }

  console.log("\n=======================================================");
  console.log("   ITXIVA MA'LUMOTLAR BAZASI MUVAFFAQIYATLI SEED QILINDI");
  console.log("=======================================================\n");

  if (credentialsTable.length > 0) {
    console.table(credentialsTable);
    console.log("\nDIQQAT: Ushbu parollar bir martalik hisoblanadi. O'quvchilarga tarqatish uchun saqlab oling!");
  } else {
    console.log("Barcha akkauntlar allaqachon mavjud edi.");
  }

  await mongoose.disconnect();
}

runSeed().catch((err) => {
  console.error("Seed jarayonida xatolik:", err);
  process.exit(1);
});
