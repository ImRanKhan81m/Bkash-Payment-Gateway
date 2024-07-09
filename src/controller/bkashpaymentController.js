const axios = require("axios");
const paymentModel = require("../Models/paymentModel");
const globals = require("node-global-storage");
const { v4: uuidv4 } = require("uuid");
const Product = require("../Models/ProductModal");
const User = require("../Models/userModel");
const { getUserByEmailService, updateUserService } = require("../services/userService");
const InvoiceNumber = require("../Models/invoiceCountNoModel");
const { createOrderService } = require("../services/orderService");

const bkashHeaders = async () => {
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    authorization: globals.get("id_token"),
    "x-app-key": process.env.bkash_api_key,
  };
};

const paymentCreate = async (req, res) => {
  const { amount, callbackURL, order } = req.body;
  globals.set("order", order);
  try {
    const { data } = await axios.post(
      process.env.bkash_create_payment_url,
      {
        mode: "0011",
        payerReference: " ",
        callbackURL: callbackURL,
        amount: amount,
        currency: "BDT",
        intent: "sale",
        merchantInvoiceNumber: "Inv" + uuidv4().substring(0, 5),
      },
      {
        headers: await bkashHeaders(),
      }
    );
    return res.status(200).json({ bkashURL: data.bkashURL });
  } catch (error) {
    return res.status(401).json({ error: error.message });
  }
};

const paymentActive = async (req, res) => {
    const { amount, callbackURL, user } = req.body;
    globals.set("user", user);
    try {
      const { data } = await axios.post(
        process.env.bkash_create_payment_url,
        {
          mode: "0011",
          payerReference: " ",
          callbackURL: callbackURL,
          amount: amount,
          currency: "BDT",
          intent: "sale",
          merchantInvoiceNumber: "Inv" + uuidv4().substring(0, 5),
        },
        {
          headers: await bkashHeaders(),
        }
      );
      return res.status(200).json({ bkashURL: data.bkashURL });
    } catch (error) {
      return res.status(401).json({ error: error.message });
    }
  };



  const activeCallBack = async (req, res) => {
    const { paymentID, status } = req.query;
  
    const user =  globals.get("user")

    const clientUrl = process.env.clientUrl;

    console.log(clientUrl)
  
    if (status === "cancel" || status === "failure") {
      return res.redirect(${clientUrl}/bikash/error?message=${status});
    }
    if (status === "success") {
      try {
        const { data } = await axios.post(
          process.env.bkash_execute_payment_url,
          { paymentID },
          {
            headers: await bkashHeaders(),
          }
        );
        if (data && data.statusCode === "0000") {
          console.log("success", data);

          const body = {
            isWholesale:"active"
          }
  
           await updateUserService(user?._id,body);
            
  
          // await paymentModel.create({
          //     userId: Math.random() * 10 + 1,
          //     paymentID,
          //     trxID: data.trxID,
          //     date: data.paymentExecuteTime,
          //     amount: parseInt(data.amount),
          // });
  
          return res.redirect(${clientUrl}/bikash/active-success);
        } else {
          return res.redirect(
            ${clientUrl}/bikash/error?message=${data.statusMessage}
          );
        }
      } catch (error) {
        console.log(error);
        return res.redirect(
          ${clientUrl}/bikash/error?message=${error.message}
        );
      }
    }
  };
  



const callBack = async (req, res) => {
  const { paymentID, status } = req.query;

  const order =  globals.get("order")
  const clientUrl = process.env.clientUrl;


  if (status === "cancel" || status === "failure") {
    return res.redirect(${clientUrl}/bikash/error?message=${status});
  }
  if (status === "success") {
    try {
      const { data } = await axios.post(
        process.env.bkash_execute_payment_url,
        { paymentID },
        {
          headers: await bkashHeaders(),
        }
      );
      if (data && data.statusCode === "0000") {
        console.log("success", data);

        if (!order.user) {
          const { phone, firstName, address } = order.shippingAddress;
          const userByEmail = await getUserByEmailService(${phone}@email.com);
          if (!userByEmail) {
            const newUser = new User({
              phone,
              fullName: firstName,
              address,
              status: "active", // You can set other default values as needed
              role: "user",
              password: "123457",
              confirmPassword: "123457",
              email: ${phone}@email.com,
            });
            const usern = await newUser.save();
            order.user = usern._id;
          } else {
            order.user = userByEmail._id;
            order.isWholesaleOrder = order.isWholesaleOrder || "no";
          }
        }

        if (!order.orderItem) {
          return res.status(200).json({
            status: "fail",
            message: "please select some product",
          });
        }
        const result = await InvoiceNumber.findOneAndUpdate(
          {
            _id: "6426e3f7fead0509ab03cfbe", // change the _id value to match the document's _id in the database
          },
          { $inc: { invoiceNumber: 1 } },
          { new: true, upsert: true }
        );
        order.invoiceNumber = result.invoiceNumber;

        // increase product sale count and decrease product stock quantity for each order item product
        for (const item of order.orderItem) {
          const product = await Product.findById(item.product);
          if (product) {
            await Product.findByIdAndUpdate(
              item.product,
              {
                $inc: {
                  saleCount: item.quantity * 1,
                  quantity: -item.quantity * 1,
                },
              },
              { new: true }
            );
          }
        }

        if (order?.codAmount) {
          await User.findByIdAndUpdate(
            order?.user,
            {
              $inc: {
                dueBaleens: order?.codAmount,
              },
            },
            { new: true }
          );
        }

        order.paymentDetails = {
            paymentID,
            trxId: data.trxID,
            number:data?.customerMsisdn,
            date: data.paymentExecuteTime,
            amount: parseInt(data.amount),
        }

        const newOrder = await createOrderService(order);

        if(newOrder){
            console.log("order create success")
        }

        // await paymentModel.create({
        //     userId: Math.random() * 10 + 1,
        //     paymentID,
        //     trxID: data.trxID,
        //     date: data.paymentExecuteTime,
        //     amount: parseInt(data.amount),
        // });

        return res.redirect(${clientUrl}/bikash/success);
      } else {
        return res.redirect(
          ${clientUrl}/bikash/error?message=${data.statusMessage}
        );
      }
    } catch (error) {
      console.log(error);
      return res.redirect(
        ${clientUrl}/bikash/error?message=${error.message}
      );
    }
  }
};

const refund = async (req, res) => {
  const { trxID } = req.params;

  try {
    const payment = await paymentModel.findOne({ trxID });

    const { data } = await axios.post(
      process.env.bkash_refund_transaction_url,
      {
        paymentID: payment.paymentID,
        amount: payment.amount,
        trxID,
        sku: "payment",
        reason: "cashback",
      },
      {
        headers: await bkashHeaders(),
      }
    );
    if (data && data.statusCode === "0000") {
      return res.status(200).json({ message: "refund success" });
    } else {
      return res.status(404).json({ error: "refund failed" });
    }
  } catch (error) {
    return res.status(404).json({ error: "refund failed" });
  }
};

module.exports = {
  paymentCreate,
  paymentActive,
  activeCallBack,
  callBack,
  refund,
};