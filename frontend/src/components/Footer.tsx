import React from "react";
import { Phone, Mail, MapPin } from "lucide-react";

const Footer: React.FC = () => {
  return (
    <footer className="bg-[#0a0720] text-gray-300 py-12">
      <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-3 gap-8">
        
        {/* About Us */}
        <div>
          <h3 className="text-white text-lg font-semibold mb-2">About Us</h3>
          <div className="w-12 h-0.5 bg-orange-500 mb-4"></div>
          <p className="text-sm leading-relaxed">
            Nextage is a industry recognized leader in providing quality,
            Accredited calibration services., in the fields of TORQUE, PRESSURE
            and others.
          </p>
          <div className="flex space-x-3 mt-4">
            <a
              href="https://www.linkedin.com/company/nextageengineering"
              target="_blank"
              rel="noopener noreferrer"
              className="bg-blue-600 p-2 rounded-full hover:opacity-80"
            >
              <img
                src="https://img.icons8.com/?size=100&id=13930&format=png&color=000000"
                alt="LinkedIn"
                className="h-5 w-5"
              />
            </a>
            <a
              href="https://wa.me/919880392277"
              target="_blank"
              rel="noopener noreferrer"
              className="bg-green-500 p-2 rounded-full hover:opacity-80"
            >
              <img
                src="https://img.icons8.com/?size=100&id=16713&format=png&color=000000"
                alt="WhatsApp"
                className="h-5 w-5"
              />
            </a>
          </div>
        </div>

        {/* Quick Links */}
        <div>
          <h3 className="text-white text-lg font-semibold mb-2">Quick Link</h3>
          <div className="w-12 h-0.5 bg-orange-500 mb-4"></div>
          <ul className="space-y-2 text-sm">
            <li><a href="https://nextelengg.com" target="_blank" rel="noopener noreferrer" className="hover:text-white">Nextage</a></li>
          </ul>
        </div>

        {/* Contact Us */}
        <div>
          <h3 className="text-white text-lg font-semibold mb-2">Contact Us</h3>
          <div className="w-12 h-0.5 bg-orange-500 mb-4"></div>
          <ul className="space-y-3 text-sm">
            <li className="flex items-center space-x-2">
              <Phone className="h-4 w-4 text-orange-400" />
              <span>+91 98803 92277</span>
            </li>
            <li className="flex items-center space-x-2">
              <Mail className="h-4 w-4 text-orange-400" />
              <span>info@nextelengg.com</span>
            </li>
            <li className="flex items-start space-x-2">
              <MapPin className="h-4 w-4 text-orange-400 mt-1" />
              <span>
                GF-01, Emerald Icon, Outer Ring Road, 104, 5BC III Block, HRBR
                Layout, Kalyan Nagar, Bangalore – 560043
              </span>
            </li>
          </ul>
        </div>

      </div>

            {/* Bottom Section with Highlighted Background */}
      <div className="bg-[#2D1B69] mt-10 border-t border-gray-800">
        <div className="max-w-7xl mx-auto px-6 py-6 flex flex-col md:flex-row justify-between items-center text-sm text-gray-400">
           <p className="mt-2 md:mt-0">
            Powered by{" "}
            <a
              href="https://aimlsn.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-orange-400 hover:text-white transition-colors font-semibold"
            >
              AIMLSolutionsNow
            </a>
          </p>
          <p>© {new Date().getFullYear()} Nextage Engineering. All Rights Reserved.</p>
          
         

        </div>
      </div>
    </footer>
  );
};

export default Footer;
