"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

export default function ReportFoundPage() {
  const router = useRouter();

  const [checkingUser, setCheckingUser] = useState(true);
  const [loading, setLoading] = useState(false);

  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [caseNumber, setCaseNumber] = useState("");

  const [imageName, setImageName] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);

  // Found person information
  const [fullName, setFullName] = useState("");
  const [cnicPakId, setCnicPakId] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("");
  const [height, setHeight] = useState("");

  // Optional supporting attributes
  const [hair, setHair] = useState("");
  const [eyeColor, setEyeColor] = useState("");
  const [distinguishingMarks, setDistinguishingMarks] = useState("");
  const [clothing, setClothing] = useState("");

  // Found location information
  const [foundLocation, setFoundLocation] = useState("");
  const [foundDate, setFoundDate] = useState("");
  const [foundTime, setFoundTime] = useState("");
  const [currentSituation, setCurrentSituation] = useState("");
  const [additionalDetails, setAdditionalDetails] = useState("");

  // Reporter information
  const [reporterName, setReporterName] = useState("");
  const [reporterPhone, setReporterPhone] = useState("");
  const [reporterEmail, setReporterEmail] = useState("");
  const [reporterType, setReporterType] = useState("");

  /* ================= LOGIN CHECK ================= */

  useEffect(() => {
    async function checkUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      setReporterName(user.user_metadata?.full_name || "");
      setReporterPhone(user.user_metadata?.phone || "");
      setReporterEmail(user.email || "");

      setCheckingUser(false);
    }

    checkUser();
  }, [router]);

  /* ================= CASE NUMBER ================= */

  function generateCaseNumber() {
    const year = new Date().getFullYear();

    const randomCode = Math.random()
      .toString(36)
      .substring(2, 8)
      .toUpperCase();

    return `FB-F-${year}-${randomCode}`;
  }

  /* ================= SUBMIT ================= */

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    setErrorMessage("");
    setSuccessMessage("");
    setCaseNumber("");

    /* ================= REQUIRED VALIDATION ================= */

    if (!foundLocation.trim()) {
      setErrorMessage("Please enter the found location.");
      return;
    }

    if (!reporterName.trim()) {
      setErrorMessage("Please enter your name.");
      return;
    }

    if (!reporterPhone.trim()) {
      setErrorMessage("Please enter your phone number.");
      return;
    }

    if (!reporterType) {
      setErrorMessage("Please select reporter type.");
      return;
    }

    if (!imageFile) {
      setErrorMessage(
        "Please upload a clear photo of the found person."
      );
      return;
    }

    try {
      setLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      const newCaseNumber = generateCaseNumber();

      /* ================= IMAGE VALIDATION ================= */

      if (!["image/jpeg", "image/png"].includes(imageFile.type)) {
        setErrorMessage(
          "Only JPG, JPEG or PNG images are allowed."
        );
        return;
      }

      if (imageFile.size > 5 * 1024 * 1024) {
        setErrorMessage(
          "Image size must be 5 MB or less."
        );
        return;
      }

      const extension =
        imageFile.name.split(".").pop()?.toLowerCase() ||
        (imageFile.type === "image/png" ? "png" : "jpg");

      const imagePath =
        `${user.id}/${newCaseNumber.toLowerCase()}.${extension}`;

      /* ================= IMAGE UPLOAD ================= */

      const { error: uploadError } =
        await supabase.storage
          .from("found-person-images")
          .upload(imagePath, imageFile, {
            cacheControl: "3600",
            upsert: false,
            contentType: imageFile.type,
          });

      if (uploadError) {
        setErrorMessage(
          `Photo upload failed: ${uploadError.message}`
        );
        return;
      }

      /* ================= DATABASE ================= */

      const { data: saved, error } = await supabase
        .from("found_reports")
        .insert({
          case_number: newCaseNumber,
          reporter_id: user.id,

          // Person information
          full_name: fullName.trim() || null,

          cnic_pak_id:
            cnicPakId.trim() || null,

          approximate_age:
            age ? Number(age) : null,

          gender:
            gender || null,

          height:
            height.trim() || null,

          // Optional physical attributes
          hair:
            hair.trim() || null,

          eye_color:
            eyeColor.trim() || null,

          distinguishing_marks:
            distinguishingMarks.trim() || null,

          clothing:
            clothing.trim() || null,

          // Found information
          found_location:
            foundLocation.trim(),

          found_date:
            foundDate || null,

          found_time:
            foundTime || null,

          current_situation:
            currentSituation || null,

          additional_details:
            additionalDetails.trim() || null,

          // Private image path
          image_url:
            imagePath,

          // Reporter information
          reporter_name:
            reporterName.trim(),

          reporter_phone:
            reporterPhone.trim(),

          reporter_email:
            reporterEmail.trim() ||
            user.email ||
            null,

          reporter_type:
            reporterType,

          status: "open",
        })
        .select("id")
        .single();

      /* ================= DATABASE ERROR ================= */

      if (error) {
        await supabase.storage
          .from("found-person-images")
          .remove([imagePath]);

        setErrorMessage(error.message);
        return;
      }

      /* ================= AUTOMATIC AI MATCHING ================= */

      if (saved?.id) {
        try {
          const {
            data: { session },
          } = await supabase.auth.getSession();

          if (session?.access_token) {
            const apiUrl =
              process.env.NEXT_PUBLIC_API_URL ||
              "http://127.0.0.1:8001";

            void fetch(
              `${apiUrl}/reports/found/${saved.id}/auto-match`,
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${session.access_token}`,
                },
              }
            ).catch(() => {
              // Report is already safely saved.
              // Matching can be retried separately.
            });
          }
        } catch {
          // Report submission remains successful even if
          // automatic matching cannot be started.
        }
      }

      /* ================= SUCCESS ================= */

      setCaseNumber(newCaseNumber);

      setSuccessMessage(
        "Found person report submitted successfully."
      );

      // Clear found person information
      setFullName("");
      setCnicPakId("");
      setAge("");
      setGender("");
      setHeight("");

      setHair("");
      setEyeColor("");
      setDistinguishingMarks("");
      setClothing("");

      // Clear found location information
      setFoundLocation("");
      setFoundDate("");
      setFoundTime("");
      setCurrentSituation("");
      setAdditionalDetails("");

      // Keep logged-in reporter information
      // but reset reporter type
      setReporterType("");

      // Clear image
      setImageFile(null);
      setImageName("");
    } catch {
      setErrorMessage(
        "Something went wrong while submitting the report."
      );
    } finally {
      setLoading(false);
    }
  }

  /* ================= LOADING ================= */

  if (checkingUser) {
    return (
      <main className="min-h-screen bg-[#06111f] text-white flex items-center justify-center">
        <p className="text-cyan-400">
          Checking your account...
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#06111f] text-white">

      {/* ================= HEADER ================= */}

      <nav className="border-b border-white/10 bg-[#06111f]">
        <div className="max-w-6xl mx-auto px-6 py-5 flex justify-between items-center">

          <a
            href="/"
            className="text-2xl font-bold"
          >
            FindBack
            <span className="text-cyan-400">
              AI
            </span>
          </a>

          <a
            href="/dashboard"
            className="text-sm text-slate-400 hover:text-white transition"
          >
            ← Back to Dashboard
          </a>

        </div>
      </nav>

      {/* ================= PAGE ================= */}

      <section className="max-w-4xl mx-auto px-6 py-12">

        {/* Heading */}

        <div className="mb-10">

          <div className="inline-flex px-4 py-2 rounded-full border border-cyan-400/20 bg-cyan-400/5 text-cyan-300 text-xs">
            FOUND PERSON REPORT
          </div>

          <h1 className="text-4xl font-bold mt-5">
            Report a Found Person
          </h1>

          <p className="text-slate-400 mt-3 leading-7 max-w-2xl">
            Provide available information about the person you found.
            A clear photo is required for AI-assisted face matching,
            while other identity and physical information can be
            provided if available.
          </p>

        </div>

        {/* ================= FORM ================= */}

        <form
          onSubmit={handleSubmit}
          className="border border-white/10 bg-white/[0.03] rounded-3xl p-6 md:p-10"
        >

          {/* ================= PERSON INFORMATION ================= */}

          <h2 className="text-xl font-semibold">
            Found Person Information
          </h2>

          <p className="text-sm text-slate-500 mt-2 mb-6">
            Enter only the information you know.
            Unknown information can be left blank.
          </p>

          <div className="grid md:grid-cols-2 gap-5">

            <Input
              label="Full Name (Optional / if known)"
              placeholder="Enter person's name if known"
              value={fullName}
              onChange={setFullName}
            />

            <Input
              label="CNIC / PAK-ID (Optional / if available)"
              placeholder="e.g. 41304-1234567-1"
              value={cnicPakId}
              onChange={setCnicPakId}
            />

            <Input
              label="Estimated Age (Optional)"
              placeholder="e.g. 24"
              type="number"
              value={age}
              onChange={setAge}
            />

            <Select
              label="Gender (Optional)"
              value={gender}
              onChange={setGender}
              options={[
                {
                  value: "",
                  label: "Select gender",
                },
                {
                  value: "Male",
                  label: "Male",
                },
                {
                  value: "Female",
                  label: "Female",
                },
                {
                  value: "Other / Unknown",
                  label: "Other / Unknown",
                },
              ]}
            />

            <Input
              label="Approximate Height (Optional)"
              placeholder="e.g. 5 ft 8 in"
              value={height}
              onChange={setHeight}
            />

          </div>

          {/* ================= APPEARANCE ================= */}

          <div className="border-t border-white/10 my-9" />

          <h2 className="text-xl font-semibold">
            Appearance & Identification
          </h2>

          <p className="text-sm text-slate-500 mt-2 mb-6">
            These are optional supporting attributes for the
            matching process.
          </p>

          <div className="grid md:grid-cols-2 gap-5">

            <Input
              label="Hair (Optional)"
              placeholder="e.g. Black, short"
              value={hair}
              onChange={setHair}
            />

            <Input
              label="Eye Color (Optional)"
              placeholder="e.g. Brown"
              value={eyeColor}
              onChange={setEyeColor}
            />

            <Input
              label="Distinguishing Mark (Optional)"
              placeholder="Scar, birthmark etc."
              value={distinguishingMarks}
              onChange={setDistinguishingMarks}
            />

            <Input
              label="Clothing Description (Optional)"
              placeholder="e.g. Blue shirt, black trousers"
              value={clothing}
              onChange={setClothing}
            />

          </div>

          {/* ================= LOCATION ================= */}

          <div className="border-t border-white/10 my-9" />

          <h2 className="text-xl font-semibold mb-6">
            Found Location & Time
          </h2>

          <div className="grid md:grid-cols-2 gap-5">

            <Input
              label="Found Location"
              placeholder="City / Area / Landmark"
              value={foundLocation}
              onChange={setFoundLocation}
              required
            />

            <Input
              label="Found Date (Optional)"
              type="date"
              value={foundDate}
              onChange={setFoundDate}
            />

            <Input
              label="Approximate Time (Optional)"
              type="time"
              value={foundTime}
              onChange={setFoundTime}
            />

            <Select
              label="Current Situation (Optional)"
              value={currentSituation}
              onChange={setCurrentSituation}
              options={[
                {
                  value: "",
                  label: "Select current situation",
                },
                {
                  value: "With Reporter",
                  label: "With Reporter",
                },
                {
                  value: "At Police Station",
                  label: "At Police Station",
                },
                {
                  value: "At Hospital",
                  label: "At Hospital",
                },
                {
                  value: "At Verified Shelter / NGO",
                  label: "At Verified Shelter / NGO",
                },
                {
                  value: "Other",
                  label: "Other",
                },
              ]}
            />

          </div>

          {/* ================= ADDITIONAL DETAILS ================= */}

          <div className="mt-6">

            <label className="text-sm text-slate-300">
              Additional Details (Optional)
            </label>

            <textarea
              rows={4}
              value={additionalDetails}
              onChange={(e) =>
                setAdditionalDetails(e.target.value)
              }
              placeholder="Describe any additional information that may help identify the person..."
              className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-cyan-400/50 text-white placeholder:text-slate-600"
            />

          </div>

          {/* ================= PHOTO ================= */}

          <div className="border-t border-white/10 my-9" />

          <h2 className="text-xl font-semibold">
            Person Photo
            <span className="text-red-400"> *</span>
          </h2>

          <p className="text-sm text-slate-500 mt-2 mb-5">
            A clear photo is required for AI-based face matching.
            JPG, JPEG or PNG only. Maximum file size: 5 MB.
          </p>

          <label className="block cursor-pointer border-2 border-dashed border-white/10 hover:border-cyan-400/40 rounded-2xl p-9 text-center transition">

            <div className="text-3xl mb-3">
              ＋
            </div>

            <p className="text-sm">
              {imageName ||
                "Click to upload person photo"}
            </p>

            <p className="text-xs text-slate-500 mt-2">
              Required • JPG, JPEG or PNG • Maximum 5 MB
            </p>

            <input
              type="file"
              accept="image/png,image/jpeg"
              required
              className="hidden"
              onChange={(e) => {
                const file =
                  e.target.files?.[0] || null;

                setErrorMessage("");

                if (!file) {
                  setImageFile(null);
                  setImageName("");
                  return;
                }

                if (
                  ![
                    "image/jpeg",
                    "image/png",
                  ].includes(file.type)
                ) {
                  setImageFile(null);
                  setImageName("");
                  e.target.value = "";

                  setErrorMessage(
                    "Only JPG, JPEG or PNG images are allowed."
                  );

                  return;
                }

                if (
                  file.size >
                  5 * 1024 * 1024
                ) {
                  setImageFile(null);
                  setImageName("");
                  e.target.value = "";

                  setErrorMessage(
                    "Image size must be 5 MB or less."
                  );

                  return;
                }

                setImageFile(file);
                setImageName(file.name);
              }}
            />

          </label>

          {/* ================= REPORTER ================= */}

          <div className="border-t border-white/10 my-9" />

          <h2 className="text-xl font-semibold mb-6">
            Reporter Information
          </h2>

          <div className="grid md:grid-cols-2 gap-5">

            <Input
              label="Your Name"
              placeholder="Enter your name"
              value={reporterName}
              onChange={setReporterName}
              required
            />

            <Input
              label="Phone Number"
              placeholder="+92..."
              value={reporterPhone}
              onChange={setReporterPhone}
              required
            />

            <Input
              label="Email Address (Optional)"
              placeholder="example@email.com"
              type="email"
              value={reporterEmail}
              onChange={setReporterEmail}
            />

            <Select
              label="Reporter Type"
              value={reporterType}
              onChange={setReporterType}
              options={[
                {
                  value: "",
                  label: "Select reporter type",
                },
                {
                  value: "Public Citizen",
                  label: "Public Citizen",
                },
                {
                  value: "Police / Authority",
                  label: "Police / Authority",
                },
                {
                  value: "Hospital Staff",
                  label: "Hospital Staff",
                },
                {
                  value: "Shelter / NGO",
                  label: "Shelter / NGO",
                },
                {
                  value: "Other",
                  label: "Other",
                },
              ]}
            />

          </div>

          {/* ================= SAFETY ================= */}

          <div className="mt-8 border border-cyan-400/15 bg-cyan-400/5 rounded-2xl p-5">

            <p className="text-sm font-semibold text-cyan-300">
              Safety & Privacy
            </p>

            <p className="text-xs text-slate-400 mt-2 leading-6">
              AI does not automatically confirm a person&apos;s
              identity. The system only generates potential matches.
              Human verification is required before case resolution
              or sensitive information is shared. CNIC/PAK-ID and
              reporter contact details are not publicly exposed.
            </p>

          </div>

          {/* ================= ERROR ================= */}

          {errorMessage && (
            <div className="mt-6 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {errorMessage}
            </div>
          )}

          {/* ================= SUCCESS ================= */}

          {successMessage && (
            <div className="mt-6 rounded-xl border border-green-500/20 bg-green-500/10 p-5">

              <p className="font-semibold text-green-300">
                ✓ {successMessage}
              </p>

              <p className="text-sm text-slate-300 mt-3">
                Your Case Number:
              </p>

              <p className="text-xl font-bold text-cyan-400 mt-1">
                {caseNumber}
              </p>

              <p className="text-xs text-slate-400 mt-3">
                Keep this case number for tracking the report.
              </p>

            </div>
          )}

          {/* ================= SUBMIT ================= */}

          <button
            type="submit"
            disabled={loading}
            className="mt-8 w-full bg-cyan-400 hover:bg-cyan-300 disabled:opacity-50 disabled:cursor-not-allowed text-[#03101d] font-bold py-4 rounded-xl transition"
          >
            {loading
              ? "Submitting Report..."
              : "Submit Found Person Report"}
          </button>

        </form>

      </section>

    </main>
  );
}

/* ================= INPUT ================= */

function Input({
  label,
  placeholder,
  type = "text",
  value,
  onChange,
  required = false,
}: {
  label: string;
  placeholder?: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <div>

      <label className="text-sm text-slate-300">
        {label}

        {required && (
          <span className="text-red-400">
            {" "}*
          </span>
        )}

      </label>

      <input
        type={type}
        value={value}
        required={required}
        placeholder={placeholder}
        onChange={(e) =>
          onChange(e.target.value)
        }
        className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-cyan-400/50 text-white placeholder:text-slate-600"
      />

    </div>
  );
}

/* ================= SELECT ================= */

function Select({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: {
    value: string;
    label: string;
  }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>

      <label className="text-sm text-slate-300">
        {label}
      </label>

      <select
        value={value}
        onChange={(e) =>
          onChange(e.target.value)
        }
        className="mt-2 w-full rounded-xl border border-white/10 bg-[#0b1727] px-4 py-3 outline-none focus:border-cyan-400/50 text-slate-300"
      >

        {options.map((option) => (
          <option
            key={option.value}
            value={option.value}
          >
            {option.label}
          </option>
        ))}

      </select>

    </div>
  );
}